import { getInstancesOfType, getInstance, boot, RunParameters } from '@bitbeat/core';
import { WebAction, WebServerConfig } from '../index';
import { merge } from 'lodash';
import { join } from 'path';
import { HTTPMethods } from 'fastify';

interface ActionDescription {
    [actionVersion: number]: {
        name: WebAction['name'];
        methods: HTTPMethods[] | HTTPMethods;
        description: string;
        url: {
            internal: string;
            external: string;
        };
        path: string;
        deprecated: WebAction['deprecated'];
        version: WebAction['version'];
        params: WebAction['inputs'];
        output: WebAction['output'];
    };
}

export default class Documentation extends WebAction {
    additionalMapping: {
        [actionName: string]: {
            [actionVersion: number]: {
                [param: string]: any;
            };
        };
    };

    constructor() {
        super();
        this.name = 'documentation';
        this.description = {
            en: 'This action will return all web actions as documentation.',
        };
        this.additionalMapping = {};
        this.strict = true;
        this.inputs = {
            language: {
                type: String,
                default: 'en',
                required: true,
                example: 'de',
                description: {
                    en:
                        'Set the language you want to get back the documentation.',
                },
            },
            fallbackLanguage: {
                type: String,
                default: 'en',
                required: false,
                example: 'de',
                description: {
                    en:
                        'Set the fallback language you want to get back the documentation if language is not found.',
                },
            },
            format: {
                type: String,
                default: '',
                required: true,
                example: 'openapi',
                description: {
                    en:
                        'Set the of the output of the documentation.',
                },
            },
        };
        merge(this.output, {
            documentation: {
                type: Object,
                example: {},
                required: true,
                description: {
                    en:
                        'This will contain all of the actions available for the web server.',
                },
            },
        });
    }

    async run(data: RunParameters): Promise<void> {
        const {
            language,
            fallbackLanguage,
        }: {
            language: string;
            fallbackLanguage: string;
        } = data.params;
        const webActions = getInstancesOfType(WebAction);
        const webConfig = getInstance(WebServerConfig)?.value;
        const [external] = boot.ips;
        const obj: {
            [actionName: string]: ActionDescription;
        } = {};
        webActions.forEach((action) => {
            const actionPath = join(
                '/',
                webConfig?.pathForActions,
                webConfig?.useVersioning && !webConfig?.useHeaderVersioning
                    ? `v${action.version}`
                    : '',
                action.name
            );

            if (!obj[action.name]) {
                obj[action.name] = {};
            }

            const actionDescription: ActionDescription = {
                [action.version]: {
                    name: action.name,
                    methods: action.methods,
                    description:
                        typeof action.description === 'string'
                            ? (action.description as string)
                            : ((action.description as any)[
                                  language
                              ] as string) ||
                              ((action.description as any)[
                                  fallbackLanguage
                              ] as string),
                    version: action.version,
                    params: {},
                    output: {},
                    deprecated: action.deprecated,
                    path: actionPath,
                    url: {
                        internal: `${
                            webConfig?.secure ? 'https' : 'http'
                        }://localhost:${webConfig?.port}${actionPath}`,
                        external: `${
                            webConfig?.secure ? 'https' : 'http'
                        }://${external}:${webConfig?.port}${actionPath}`,
                    },
                },
            };
            Object.keys(action.output).forEach((output) => {
                actionDescription[action.version].output[output] = {
                    ...action.output[output],
                    type: action.output[output].type.name as any,
                    description:
                        typeof action.output[output].description === 'string'
                            ? (action.output[output].description as string)
                            : ((action.output[output].description as any)[
                                  language
                              ] as string) ||
                              ((action.output[output].description as any)[
                                  fallbackLanguage
                              ] as string),
                };
            });
            merge(obj[action.name], actionDescription);

            Object.keys(action.inputs).forEach((input) => {
                const param = {
                    ...action.inputs[input],
                    type: action.inputs[input].type.name,
                    description:
                        typeof action.inputs[input].description === 'string'
                            ? (action.inputs[input].description as string)
                            : ((action.inputs[input].description as any)[
                                  language
                              ] as string) ||
                              ((action.inputs[input].description as any)[
                                  fallbackLanguage
                              ] as string),
                };
                delete param.format;
                delete param.validate;
                obj[action.name][action.version].params[input] = param as any;
            });

            merge(
                obj[action.name][action.version],
                ((this.additionalMapping || {})[action.name] || {})[
                    action.version
                ]
            );
        });
        data.result.documentation = obj;
        return super.run(data);
    }
}
