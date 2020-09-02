import { WebAction } from '../index';
import { RunParameters } from '@bitbeat/core';

export default class Status extends WebAction {
    constructor() {
        super();
        this.name = 'status';
        this.description = {
            en: 'This action will return the code of status.',
        };
        this.strict = true;
        this.methods = ['GET'];
        this.inputs = {};
        this.output = {};
    }

    async run(data: RunParameters): Promise<void> {
        return super.run(data);
    }
}
