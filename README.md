# BITBEAT WEB MODULE

## Introduction

This is the official web module for bitbeat using fastify as web server.<br>
This package will export you a web server, a web server config and basic default actions.<br>
To use it follow the documentation of bitbeat at [the homepage](https://bitbeat.projects.oliverfreudrich.com/#/?id=add-existing-module-extend-core).

## Default modules

The following modules are always enabled:

-   [fastify-cors](https://github.com/fastify/fastify-cors)
-   [fastify-helmet](https://github.com/fastify/fastify-helmet)
-   [fastify-sensible](https://github.com/fastify/fastify-sensible)

Optionally these modules can be enabled or disabled:

-   [fastify-rate-limiter](https://github.com/fastify/fastify-rate-limit) (enabled in production by default)
-   [underPressure](https://github.com/fastify/under-pressure) (enabled in production by default)
-   [middie](https://github.com/fastify/middie) (enabled in default)

## Configure

The default `WebConfig` looks like this:

```typescript
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
```

You can edit those properties by either extending the `WebConfig` class in your project's config folder as own class or edit it in the `boot.js`.

### Example 1:

-- config<br>
&nbsp;|-- myOwnConfig.ts

```typescript
import { WebConfig } from '@bitbeat/web';
import { merge } from 'lodash';

export default class MyOwnConfig extends WebConfig {
    constructor() {
        super();
    }

    default = {}; // this will overwrite the default props

    /* or you can do something non-destructive like this
    default = merge(default, {
        port: 3000,
    });
    */
}
```

### Example 2:

This example happens in the `boot.js`:

```typescript
import { registerBulk } from '@bitbeat/core';
import { WebConfig, WebServer } from '@bitbeat/web';

export default async () => {
    const webConfig = new WebConfig();
    webConfig.default.port = 3000;
    await registerBulk(new Set([webConfig, WebServer]));
};
```

## Custom integrations

To add your own custom logic to the existing server use one of the following methods:

-   `preRegister`
-   `postRegister`
-   `postRouteRegister`
-   `postServerStart`
-   `postServerStop`

These are a sets of functions, which will run one by one and support `async`. There is always the "current" `WebServer`-runtime and `WebConfig` provided in those functions.

## Add actions

To add your own web action to the web server, just extend the `WebAction`-class in the `actions` folder and the web server will automatically load them. Examples can be found in the default web actions.
