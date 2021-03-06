import {
    logger,
    getInstance,
    getInstancesOfType,
    Server,
    Result,
    boot,
    store,
    generateDebugger,
} from '@bitbeat/core';
import * as Throttle from 'promise-parallel-throttle';
import WebAction from '../webAction';
import WebConnection from '../webConnection';
import WebConnectionMiddleware from '../webConnectionMiddleware';
import WebServerConfig from '../config/webServerConfig';
import fastify, { FastifyInstance, RouteShorthandOptions } from 'fastify';
import fastifyCORS from 'fastify-cors';
import fastifyHelmet from 'fastify-helmet';
import fastifyRateLimit from 'fastify-rate-limit';
import fastifySensible from 'fastify-sensible';
import middie from 'middie';
import underPressure from 'under-pressure';
import { Debugger } from 'debug';
import { join } from 'path';
import { merge } from 'lodash';

export default class WebServer extends Server {
    runtime: FastifyInstance | undefined;
    preRegister?: Set<
        (
            runtime: FastifyInstance | undefined,
            config: WebServerConfig | undefined
        ) => Promise<void>
    > = new Set();
    postRegister?: Set<
        (
            runtime: FastifyInstance | undefined,
            config: WebServerConfig | undefined
        ) => Promise<void>
    > = new Set();
    postRouteRegister?: Set<
        (
            runtime: FastifyInstance | undefined,
            config: WebServerConfig | undefined
        ) => Promise<void>
    > = new Set();
    postServerStart?: Set<
        (
            runtime: FastifyInstance | undefined,
            config: WebServerConfig | undefined
        ) => Promise<void>
    > = new Set();
    postServerStop?: Set<
        (
            runtime: FastifyInstance | undefined,
            config: WebServerConfig | undefined
        ) => Promise<void>
    > = new Set();
    debug: Debugger | any;

    constructor() {
        super();
        this.startPriority = 800;
        this.stopPriority = 800;
    }

    async configure(): Promise<void> {
        this.debug = generateDebugger(this.name);
    }

    async start(): Promise<void> {
        const config = getInstance(WebServerConfig);
        const options = config?.value.options || {};

        const actions = getInstancesOfType(WebAction);
        this.runtime = <any>fastify({
            ...options,
            logger,
        });

        if (!this.runtime) {
            throw new Error('Could not create runtime.');
        }

        if (this.preRegister?.size) {
            await Throttle.all(
                [...this.preRegister].map((register) => async () =>
                    register(this.runtime, config)
                ),
                {
                    maxInProgress: 1,
                }
            );
        }

        // enable default stuff like cors and security headers
        this.runtime.register(fastifyCORS, config?.value.fastifyCors);
        this.debug(`Registered fastify cors.`);
        this.runtime.register(fastifyHelmet, config?.value.fastifyHelmet);
        this.debug(`Registered fastify helmet.`);
        this.runtime.register(fastifySensible);
        this.debug(`Registered fastify sensible.`);

        // optionally enable rate limiter
        if (config?.value.fastifyRateLimit) {
            this.runtime.register(
                fastifyRateLimit,
                config?.value.fastifyRateLimit
            );
            this.debug(`Registered fastify rate limiter.`);
        }

        // optionally enable under pressure
        if (config?.value.underPressure) {
            this.runtime.register(underPressure, config?.value.underPressure);
            this.debug(`Registered fastify under pressure.`);
        }

        // enable all kind of middlewares
        if (config?.value.enableMiddlewares) {
            await this.runtime.register(middie);
            this.debug(`Registered fastify middie.`);
        }

        if (this.postRegister?.size) {
            await Throttle.all(
                [...this.postRegister].map((register) => async () =>
                    register(this.runtime, config)
                ),
                {
                    maxInProgress: 1,
                }
            );
        }

        const connectionMiddlewares: Set<WebConnectionMiddleware> = new Set(
            [...this.getConnectionMiddlewares()].filter(
                (instance) => instance instanceof WebConnectionMiddleware
            )
        );
        [...actions].forEach((action) => {
            this.runtime?.route({
                url: join(
                    '/',
                    config?.value.pathForActions || '',
                    `${
                        config?.value.useVersioning &&
                        !config?.value.useHeaderVersioning
                            ? `/v${action.version}`
                            : ''
                    }`,
                    action.name
                ),
                method: action.methods,
                version:
                    config?.value.useVersioning &&
                    config?.value.useHeaderVersioning
                        ? (action.version as string)
                        : undefined,
                config: {
                    params: {} as any,
                    result: new Result(),
                },
                preValidation: async (req, res) => {
                    try {
                        let conn = this.getConnection(req.ip) as WebConnection;
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
                                    config?.value.secure,
                                    async () => {
                                        await Throttle.all(
                                            [
                                                ...connectionMiddlewares,
                                            ].map((middleware) => async () =>
                                                await middleware.beforeDestroy(
                                                    conn,
                                                    this
                                                )
                                            ),
                                            {
                                                maxInProgress: 1,
                                            }
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
                                            ),
                                            {
                                                maxInProgress: 1,
                                            }
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
                                ),
                                {
                                    maxInProgress: 1,
                                }
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
                                ),
                                {
                                    maxInProgress: 1,
                                }
                            );
                        } catch (e) {
                            this.debug(
                                `Rejected client '${
                                    conn.id
                                }' with error '${e.toString()}'.`
                            );
                            logger.debug(
                                `Rejected client '${
                                    conn.id
                                }' with error '${e.toString()}'.`
                            );
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
                        action.strict &&
                        !!action.strict.acceptType
                    ) {
                        res.badRequest(
                            "The accept type you have set doesn't match the return type of this action."
                        );
                        return;
                    }

                    const middlewares = boot.getMiddlewaresOfInstance(
                        action,
                        store
                    );
                    await Throttle.all(
                        [...middlewares].map((middleware: any) => async () =>
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
                    const middlewares = boot.getMiddlewaresOfInstance(
                        action,
                        store
                    );
                    await Throttle.all(
                        [...middlewares].map((middleware: any) => async () =>
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

                    if (action.strict.output && action.output) {
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
            logger.debug(
                `Added action '${action.name}' as route with methods ${
                    Array.isArray(action.methods)
                        ? action.methods
                              .map((item: string) => `'${item}'`)
                              .join(', ')
                        : `${action.methods}`
                }.`
            );
            this.debug(
                `Added action '${action.name}' as route with methods ${
                    Array.isArray(action.methods)
                        ? action.methods
                              .map((item: string) => `'${item}'`)
                              .join(', ')
                        : `${action.methods}`
                }.`
            );
        });

        if (this.postRouteRegister?.size) {
            await Throttle.all(
                [...this.postRouteRegister].map((register) => async () =>
                    register(this.runtime, config)
                ),
                {
                    maxInProgress: 1,
                }
            );
        }

        await this.runtime.listen(
            config?.value.port as number,
            config?.value.host as string
        );
        this.debug(`${this.name} started.`);
        logger.info(`${this.name} started.`);

        if (this.postServerStart?.size) {
            await Throttle.all(
                [...this.postServerStart].map((fn) => async () =>
                    fn(this.runtime, config)
                ),
                {
                    maxInProgress: 1,
                }
            );
        }

        return super.start();
    }

    async stop(): Promise<void> {
        const config = getInstance(WebServerConfig);
        const connectionMiddlewares: Set<WebConnectionMiddleware> = new Set(
            [...this.getConnectionMiddlewares()].filter(
                (instance) => instance instanceof WebConnectionMiddleware
            )
        );
        await Throttle.all(
            [...this.connections].map((conn) => async () => {
                await Throttle.all(
                    [...connectionMiddlewares].map((middleware) => async () =>
                        await middleware.beforeDestroy(conn, this)
                    ),
                    {
                        maxInProgress: 1,
                    }
                );
                await conn.close();
                await Throttle.all(
                    [...connectionMiddlewares].map((middleware) => async () =>
                        await middleware.afterDestroy(conn, this)
                    ),
                    {
                        maxInProgress: 1,
                    }
                );
            })
        );
        await this.runtime?.close();
        this.debug(`${this.name} stopped.`);
        logger.info(`${this.name} stopped.`);

        if (this.postServerStop?.size) {
            await Throttle.all(
                [...this.postServerStop].map((fn) => async () =>
                    fn(this.runtime, config)
                ),
                {
                    maxInProgress: 1,
                }
            );
        }

        return super.stop();
    }
}
