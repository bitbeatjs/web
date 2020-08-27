import { Configuration } from '@bitbeat/core';

export default class WebServerConfig extends Configuration {
    default = {
        options: {
            disableRequestLogging: true,
        },
        port: 8080,
        pathForActions: 'api',
        useVersioning: true,
        useHeaderVersioning: false,
    };

    production = {
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