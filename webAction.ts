import { Action, Result } from '@bitbeat/core';
import { FastifyReply, FastifyRequest, HTTPMethods } from 'fastify';

export default class WebAction extends Action {
    methods: HTTPMethods[] | HTTPMethods = ['GET', 'POST'];
    contentType = 'application/json';
    strict = false;

    constructor() {
        super();
    }

    async run(data: {
        params: any;
        result: Result;
        raw: {
            request: FastifyRequest;
            response: FastifyReply;
        };
    }): Promise<any | void> {}
}
