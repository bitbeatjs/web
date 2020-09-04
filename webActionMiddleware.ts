import { ActionMiddleware } from '@bitbeat/core';
import { FastifyReply, FastifyRequest } from 'fastify';
import WebAction from './webAction';

export default class WebActionMiddleware extends ActionMiddleware {
    constructor() {
        super();
    }
    /**
     * The function to run before running the run function.
     */
    public async beforeRun(data: {
        action: WebAction;
        result: any;
        raw: {
            req: FastifyRequest;
            res: FastifyReply;
        };
    }): Promise<void> {}
    /**
     * The function to run after running the run function.
     */
    public async afterRun(data: {
        action: WebAction;
        result: any;
        raw: {
            req: FastifyRequest;
            res: FastifyReply;
        };
    }): Promise<void> {}
}
