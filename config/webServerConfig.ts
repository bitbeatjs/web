import { Configuration } from '@bitbeat/core';

interface WebConfigProperties {
    options?: {
        [name: string]: any;
    };
    host?: string;
    port?: number;
    pathForActions?: string;
    useVersioning?: boolean;
    useHeaderVersioning?: boolean;
    [name: string]: any;
}

export default class WebServerConfig extends Configuration {
    constructor() {
        super();
    }

    default: WebConfigProperties = {
        options: {
            disableRequestLogging: true,
        },
        host: '0.0.0.0',
        port: 8080,
        pathForActions: 'api',
        useVersioning: true,
        useHeaderVersioning: false,
        enableMiddlewares: true,
    };

    production: WebConfigProperties = {
        fastifyRateLimit: {
            max: 100,
        },
        underPressure: {
            maxEventLoopDelay: 1000,
            maxHeapUsedBytes: 100000000,
            maxRssBytes: 100000000,
        },
    };
}
