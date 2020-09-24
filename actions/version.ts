import { boot, RunParameters } from '@bitbeat/core';
import WebAction from '../webAction';
import { merge } from 'lodash';

export default class Version extends WebAction {
    constructor() {
        super();
        this.name = 'version';
        this.description = {
            en: 'This action will return the current version.',
        };
        this.strict = true;
        this.methods = ['GET'];
        this.inputs = {};
        merge(this.output, {
            version: {
                type: String,
                required: true,
                example: '0.0.1',
                description: {
                    en: 'This will output the version you are using.',
                },
            },
        });
    }

    async run(data: RunParameters): Promise<void> {
        data.result.version = boot.version;
        return super.run(data);
    }
}
