import {
    logger,
    getInstance,
    getInstancesOfType,
    Server,
    Result,
    ConnectionMiddleware,
    boot,
    Boot,
} from '@bitbeat/core';
import fastify, { FastifyInstance } from 'fastify';
import fastifyCORS from 'fastify-cors';
import fastifyRateLimit from 'fastify-rate-limit';
import underPressure from 'under-pressure';
import fastifySensible from 'fastify-sensible';
import fastifyHelmet from 'fastify-helmet';
import { WebAction, WebServerConfig, WebConnection } from '../';
import * as Throttle from 'promise-parallel-throttle';
import { merge } from 'lodash';
import { Debugger, debug } from 'debug';

export default class WebServer extends Server {
    runtime: FastifyInstance | undefined;
    preRegister?: (runtime: FastifyInstance) => void;
    postRegister?: (runtime: FastifyInstance) => void;
    postRouteRegister?: (runtime: FastifyInstance) => void;
    debug: Debugger | any;

    constructor() {
        super();
        this.startPriority = 800;
        this.stopPriority = 800;
    }

    async configure(): Promise<void> {
        this.debug = debug(`${boot.name}:${this.name}`);
        debug.disable();

        if (Boot.getEnvVar('BITBEAT_DEBUG', true)) {
            debug.enable(`${boot.name}:*`);
        }
    }

    async start(): Promise<void> {
        const config = getInstance(WebServerConfig)?.value;
        const options = config?.options || {};

        const actions = getInstancesOfType(WebAction);
        this.runtime = <any>fastify({
            ...options,
            logger,
        });

        if (!this.runtime) {
            throw new Error('Could not create runtime.');
        }

        if (this.preRegister) {
            this.preRegister(this.runtime);
        }

        this.runtime.register(fastifyCORS, options.fastifyCors);
        this.debug(`Registered fastify cors.`);
        this.runtime.register(fastifyHelmet, options.fastifyHelmet);
        this.debug(`Registered fastify helmet.`);
        this.runtime.register(fastifySensible);
        this.debug(`Registered fastify sensible.`);

        if (options.fastifyRateLimit) {
            this.runtime.register(fastifyRateLimit, options.fastifyRateLimit);
            this.debug(`Registered fastify rate limiter.`);
        }

        if (options.underPressure) {
            this.runtime.register(underPressure, options.underPressure);
            this.debug(`Registered fastify under pressure.`);
        }

        if (this.postRegister) {
            this.postRegister(this.runtime);
        }

        [...actions].forEach((action) => {
            this.runtime?.route({
                url: `/${config?.pathForActions}/${
                    config?.useVersioning && !config?.useHeaderVersioning
                        ? `v${action.version}`
                        : ''
                }/${action.name}`,
                method: action.methods,
                version:
                    config?.useVersioning && config?.useHeaderVersioning
                        ? `${action.version}.0.0`
                        : undefined,
                config: {
                    params: {} as any,
                    result: new Result(),
                },
                preValidation: async (req, res) => {
                    try {
                        let conn = this.getConnection(req.ip) as WebConnection;
                        const connectionMiddlewares: Set<ConnectionMiddleware> = this.getMiddlewaresOfType(
                            ConnectionMiddleware
                        ) as Set<ConnectionMiddleware>;
                        try {
                            if (!conn) {
                                this.debug(
                                    `Unknown connection. Creating instance.`
                                );
                                logger.debug(
                                    `Unknown connection. Creating instance.`
                                );
                                conn = new WebConnection(
                                    this,
                                    req.raw.connection,
                                    config?.secure,
                                    async () => {
                                        await Throttle.all(
                                            [
                                                ...connectionMiddlewares,
                                            ].map((middleware) => async () =>
                                                await middleware.beforeDestroy(
                                                    conn,
                                                    this
                                                )
                                            )
                                        );
                                        await this.removeConnection(conn);
                                        await Throttle.all(
                                            [
                                                ...connectionMiddlewares,
                                            ].map((middleware) => async () =>
                                                await middleware.afterDestroy(
                                                    conn,
                                                    this
                                                )
                                            )
                                        );
                                    }
                                );
                            } else {
                                this.debug(
                                    `Found connection. Resetting recycling timeout.`
                                );
                                logger.debug(
                                    `Found connection. Resetting recycling timeout.`
                                );
                                conn.resetKeepAliveInterval();
                            }
                            await Throttle.all(
                                [
                                    ...connectionMiddlewares,
                                ].map((middleware) => async () =>
                                    await middleware.beforeCreate(conn, this)
                                )
                            );
                            this.addConnection(conn);
                            this.debug(`Verified client with id '${conn.id}'.`);
                            logger.debug(
                                `Verified client with id '${conn.id}'.`
                            );
                            await Throttle.all(
                                [
                                    ...connectionMiddlewares,
                                ].map((middleware) => async () =>
                                    await middleware.afterCreate(conn, this)
                                )
                            );
                        } catch (e) {
                            res.forbidden(e.toString());
                            return;
                        }

                        res.context.config.params = merge(
                            {},
                            req.params,
                            req.query,
                            req.body
                        );
                        await Throttle.all(
                            Object.keys(action.inputs).map(
                                (input) => async () => {
                                    if (
                                        action.inputs[input].default &&
                                        !res.context.config.params[input]
                                    ) {
                                        res.context.config.params[input] =
                                            action.inputs[input].default;
                                    }

                                    if (
                                        !res.context.config.params[input] &&
                                        action.inputs[input].required
                                    ) {
                                        throw new Error(
                                            `Missing required property '${input}'.`
                                        );
                                    }

                                    if (
                                        res.context.config.params[input] &&
                                        res.context.config.params[input]
                                            .constructor.name !==
                                            (action.inputs[input].type as any)
                                                .name
                                    ) {
                                        throw new Error(
                                            `Wrong type. Got '${
                                                res.context.config.params[input]
                                                    .constructor.name
                                            }' but needed '${
                                                (action.inputs[input]
                                                    .type as any).name
                                            }'.`
                                        );
                                    }

                                    if (
                                        !action.inputs[input].validate ||
                                        (!res.context.config.params[input] &&
                                            action.inputs[input].validate)
                                    ) {
                                        return;
                                    }

                                    return (action.inputs[
                                        input
                                    ] as any).validate(
                                        res.context.config.params[input],
                                        input
                                    );
                                }
                            )
                        );
                    } catch (e) {
                        res.badRequest(e);
                    }
                },
                preHandler: async (req, res) => {
                    try {
                        await Throttle.all(
                            Object.keys(action.inputs).map(
                                (input) => async () => {
                                    if (
                                        !action.inputs[input].format ||
                                        (!res.context.config.params[input] &&
                                            action.inputs[input].format)
                                    ) {
                                        return res.context.config.params[input];
                                    }

                                    return (action.inputs[input] as any).format(
                                        res.context.config.params[input],
                                        input
                                    );
                                }
                            )
                        );
                    } catch (e) {
                        res.internalServerError(e);
                    }
                },
                handler: async (req, res) => {
                    const acceptType = req.headers.accept;

                    if (
                        acceptType &&
                        acceptType !== '*/*' &&
                        !~acceptType.indexOf(action.contentType) &&
                        action.strict
                    ) {
                        res.badRequest(
                            "The accept type you have set doesn't match the return type of this action."
                        );
                        return;
                    }

                    await Throttle.all(
                        [...action.middlewares].map((middleware) => async () =>
                            middleware.beforeRun({
                                action,
                                result: res.context.config.result,
                                raw: {
                                    request: req,
                                    response: res,
                                },
                            })
                        ),
                        {
                            maxInProgress: 1,
                        }
                    );

                    const result =
                        (await action.run({
                            params: res.context.config.params,
                            result: res.context.config.result,
                            raw: {
                                request: req,
                                response: res,
                            },
                        })) || res.context.config.result;

                    res.type(action.contentType);

                    return result;
                },
                preSerialization: async (req, res, payload: any) => {
                    await Throttle.all(
                        [...action.middlewares].map((middleware) => async () =>
                            middleware.afterRun({
                                action,
                                result: payload,
                                raw: {
                                    request: req,
                                    response: res,
                                },
                            })
                        ),
                        {
                            maxInProgress: 1,
                        }
                    );

                    if (action.strict && action.output) {
                        const obj: any = {};
                        Object.keys(action.output).forEach((param) => {
                            if (
                                action.output[param].default &&
                                !payload[param]
                            ) {
                                payload[param] = action.output[param].default;
                            }

                            if (
                                action.output[param].required &&
                                !payload[param]
                            ) {
                                throw new Error('Missing output param.');
                            }

                            if (
                                action.output[param].type.name.toLowerCase() ===
                                typeof payload[param]
                            ) {
                                obj[param] = payload[param];
                            }
                        });
                        return obj;
                    }

                    return payload;
                },
            });
        });

        if (this.postRouteRegister) {
            this.postRouteRegister(this.runtime);
        }

        await this.runtime.listen(config?.port || 8080);
        return super.start();
    }

    async stop(): Promise<void> {
        await Throttle.all(
            [...this.connections].map((conn) => async () => await conn.close())
        );
        await this.runtime?.close();
        this.debug(`${this.name} stopped.`);
        logger.info(`${this.name} stopped.`);
        return super.stop();
    }
}
