import WebAction from '../webAction';
import { RunParameters } from '@bitbeat/core';

export default class Status extends WebAction {
    constructor() {
        super();
        this.name = 'status';
        this.description = {
            en: 'This action will return the code of status.',
        };
        this.tags = new Set(['status']);
        this.strict = true;
        this.methods = ['GET'];
        this.inputs = {};
        this.output = {};
    }

    async run(data: RunParameters): Promise<void> {
        return super.run(data);
    }
}
