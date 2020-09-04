import { Configuration } from '@bitbeat/core';

export default class WebServerConfig extends Configuration {
    constructor() {
        super();
    }

    default: {
        [name: string]: any;
    } = {
        options: {
            disableRequestLogging: true,
        },
        port: 8080,
        pathForActions: 'api',
        useVersioning: true,
        useHeaderVersioning: false,
    };

    production: {
        [name: string]: any;
    } = {
        options: {
            fastifyRateLimit: {
                max: 100,
            },
            underPressure: {
                maxEventLoopDelay: 1000,
                maxHeapUsedBytes: 100000000,
                maxRssBytes: 100000000,
            },
        },
    };
}