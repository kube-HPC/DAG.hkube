const { expect } = require('chai');
const { uuid: uuidv4 } = require('@hkube/uid');
const NodesMap = require('../lib/graph/dag');
const { Persistency } = require('../index');
const pipelines = require('./pipelines.json');

const dbConfig = {
    provider: 'mongo',
    mongo: {
        auth: {
            user: 'tester',
            password: 'password',
        },
        host: 'localhost',
        port: 27017,
        dbName: 'hkube',
    }
};

describe('Persistency', () => {
    it('should save and get graph', async () => {
        const nodesMap = new NodesMap(pipelines[0]);
        const persistency = new Persistency()
        await persistency.init({ connection: dbConfig })
        const jobId = `jobId-${uuidv4()}`;
        const data = { ...nodesMap.getJSONGraph(), jobId, timestamp: Date.now() };
        await persistency.setGraph({ jobId, data });
        const getRes = await persistency.getGraph({ jobId });
        expect(getRes).to.eql(data);
    });

    it('should return null if no graph', async () => {
        const nodesMap = new NodesMap(pipelines[0]);
        const persistency = new Persistency()
        await persistency.init({ connection: dbConfig })
        const jobId = `jobId-${uuidv4()}`;
        const data = { ...nodesMap.getJSONGraph(), jobId, timestamp: Date.now() };
        await persistency.setGraph({ jobId, data: null });
        const getRes = await persistency.getGraph({ jobId });
        expect(getRes).to.not.exist;
    });

    it('should update current graph', async () => {
        const nodesMap = new NodesMap(pipelines[0]);
        const persistency = new Persistency()
        await persistency.init({ connection: dbConfig })
        const jobId = `jobId-${uuidv4()}`;
        const data = { ...nodesMap.getJSONGraph(), jobId, timestamp: Date.now() };
        await persistency._adapter._db.jobs.create({ jobId, graph: data })
        const updated = { options: {}, nodes: [], edges: [], jobId, timestamp: Date.now() };
        await persistency.setGraph({ jobId, data: updated });
        const getRes = await persistency.getGraph({ jobId });
        expect(getRes).to.eql(updated);
    });

    it('should fail to get non-exist graph', async () => {
        const persistency = new Persistency()
        await persistency.init({ connection: dbConfig })
        const jobId = `jobId-${uuidv4()}`;
        const getRes = await persistency.getGraph({ jobId });
        expect(getRes).to.not.exist;
    });
});