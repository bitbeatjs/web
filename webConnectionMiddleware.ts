import { ConnectionMiddleware } from '@bitbeat/core';
import WebConnection from './webConnection';
import WebServer from './servers/webServer';

export default class WebConnectionMiddleware extends ConnectionMiddleware {
    constructor() {
        super();
    }

    public async beforeCreate(
        connection: WebConnection,
        server: WebServer
    ): Promise<void> {}
    public async afterCreate(
        connection: WebConnection,
        server: WebServer
    ): Promise<void> {}
    public async beforeDestroy(
        connection: WebConnection,
        server: WebServer
    ): Promise<void> {}
    public async afterDestroy(
        connection: WebConnection,
        server: WebServer
    ): Promise<void> {}
}
