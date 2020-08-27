import { Connection, Server } from '@bitbeat/core';
import { Socket } from 'net';

export default class WebConnection extends Connection {
    constructor(
        server: Server,
        connection: Socket,
        secure: boolean,
        recycleFunction: () => Promise<void>
    ) {
        super(server, connection, secure, recycleFunction);
    }
}
