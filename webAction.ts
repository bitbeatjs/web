import { Action, Result } from '@bitbeat/core';
import { FastifyReply, FastifyRequest, HTTPMethods } from 'fastify';
import WebActionMiddleware from './webActionMiddleware';

export default class WebAction extends Action {
    methods: HTTPMethods[] | HTTPMethods = ['GET', 'POST'];
    contentType = 'application/json';
    strict = false;
    middlewares: Set<WebActionMiddleware> = new Set();

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
