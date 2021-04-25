const { expect } = require('chai');
const clone = require('clone');
const { uuid: uuidv4 } = require('@hkube/uid');
const NodesMap = require('../lib/nodes/nodes-map');
const Node = require('../lib/nodes/node');
const Batch = require('../lib/nodes/node-batch');
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


describe('NodesMap', () => {
    describe('Validation', () => {
        it('should throw stateful node is not allowed on batch pipeline', () => {
            const pipeline = {
                name: "pipeline",
                kind: "batch",
                nodes: [{
                    nodeName: "A",
                    algorithmName: "green-alg",
                    input: ["data"],
                    stateType: "stateful"
                }]
            }
            expect(() => new NodesMap(pipeline)).to.throw('stateful node "A" is not allowed on batch pipeline');
        });
        it('should throw missing algorithmName', () => {
            const pipeline = {
                name: "pipeline",
                nodes: [{
                    nodeName: "A",
                    kind: "algorithm",
                    input: ["data"],
                }]
            }
            expect(() => new NodesMap(pipeline)).to.throw('please provide algorithmName');
        });
        it('should throw missing pipelineName', () => {
            const pipeline = {
                name: "pipeline",
                nodes: [{
                    nodeName: "A",
                    kind: "pipeline",
                    input: ["data"],
                }]
            }
            expect(() => new NodesMap(pipeline)).to.throw('please provide pipelineName');
        });
        it('should throw found duplicate node', () => {
            const pipeline = {
                name: "pipeline",
                nodes: [{
                    nodeName: "A",
                    algorithmName: "green-alg",
                    input: ["data"],
                },
                {
                    nodeName: "A",
                    algorithmName: "green-alg",
                    input: ["data"],
                }]
            }
            expect(() => new NodesMap(pipeline)).to.throw('found duplicate node "A"');
        });
        it('should throw reserved name flowInput', () => {
            const pipeline = {
                name: "pipeline",
                nodes: [{
                    nodeName: "flowInput",
                    algorithmName: "green-alg",
                    input: ["data"],
                }]
            }
            expect(() => new NodesMap(pipeline)).to.throw('pipeline "pipeline" has invalid reserved name "flowInput"');
        });
        it('should throw reserved name dataSource', () => {
            const pipeline = {
                name: "pipeline",
                nodes: [{
                    nodeName: "dataSource",
                    algorithmName: "green-alg",
                    input: ["data"],
                }]
            }
            expect(() => new NodesMap(pipeline)).to.throw('pipeline "pipeline" has invalid reserved name "dataSource"');
        });
        it('should throw node depend on non-exists node', () => {
            const pipeline = {
                name: "pipeline",
                nodes: [{
                    nodeName: "A",
                    algorithmName: "green-alg",
                    input: ["@NOOP"],
                }]
            }
            expect(() => new NodesMap(pipeline)).to.throw('node "A" is depend on node "NOOP" which is not exists');
        });
        it('should throw unable to find flowInput', () => {
            const pipeline = {
                name: "pipeline",
                nodes: [{
                    nodeName: "A",
                    algorithmName: "green-alg",
                    input: ["@flowInput.noop"]
                }]
            }
            expect(() => new NodesMap(pipeline, { checkFlowInput: true })).to.throw('unable to find flowInput.noop');
        });
        it('should throw entry node stateless on stream pipeline', () => {
            const pipeline = {
                name: "pipeline",
                kind: "stream",
                nodes: [{
                    nodeName: "A",
                    kind: "algorithm",
                    algorithmName: "green-alg",
                    input: ["data"]
                }]
            }
            expect(() => new NodesMap(pipeline, { checkFlowInput: true })).to.throw('entry node "A" cannot be stateless on stream pipeline');
        });
        it('should throw pipeline has cyclic nodes', () => {
            const pipeline = {
                name: "pipeline",
                kind: "batch",
                nodes: [{
                    nodeName: "A",
                    algorithmName: "green-alg",
                    input: ["@B"]
                },
                {
                    nodeName: "B",
                    algorithmName: "green-alg",
                    input: ["@A"]
                }]
            }
            expect(() => new NodesMap(pipeline, { checkFlowInput: true })).to.throw('cyclic nodes are not allowed on batch pipeline');
        });
        it('should build graph', () => {
            const pipeline = pipelines.find(p => p.name === 'dataSource-stream');
            const nodesMap = new NodesMap(pipeline);
            expect(nodesMap).to.exist;
        });
        it('should throw @ sign is not allowed', () => {
            const pipeline = pipelines.find(p => p.name === 'relations-stream');
            expect(() => new NodesMap(pipeline)).to.throw('the "@" sign is not allowed in "stream" pipeline, please use the "streaming.flows" property instead');
        });
    });
    describe('Graph', () => {
        it('should find entry nodes', () => {
            const pipeline = pipelines.find(p => p.name === 'simple-wait-batch');
            const firstNode = pipeline.nodes[0];
            const nodesMap = new NodesMap(pipeline);
            const entryNodes = nodesMap.getSources();
            expect(entryNodes[0]).to.equal(firstNode.nodeName);
        });
        it('should get node by name', () => {
            const pipeline = pipelines.find(p => p.name === 'simple-wait-batch');
            const firstNode = pipeline.nodes[0];
            const nodesMap = new NodesMap(pipeline);
            const node = nodesMap.getNode(firstNode.nodeName);
            expect(node.nodeName).to.equal(firstNode.nodeName);
        });
        it('should include node in results', () => {
            const pipeline = pipelines.find(p => p.name === 'batch');
            const firstNode = pipeline.nodes[0];
            const nodesMap = new NodesMap(pipeline);
            const node = nodesMap.getNode(firstNode.nodeName);
            expect(node.includeInResults).to.be.true;
            const resultNodes = nodesMap.pipelineResults();
            expect(resultNodes).to.have.lengthOf(2);
            expect(resultNodes[0].nodeName).to.eql('green')
            expect(resultNodes[1].nodeName).to.eql('yellow')

        });
        it('should not get node by name', () => {
            const pipeline = pipelines.find(p => p.name === 'simple-wait-batch');
            const nodesMap = new NodesMap(pipeline);
            const node = nodesMap.getNode('not_exists');
            expect(node).to.be.undefined;
        });
        it('should run simple-flow', () => {
            const pipeline = pipelines.find(p => p.name === 'simple-flow');
            const green = pipeline.nodes[0];
            const yellow = pipeline.nodes[1];
            const status = 'succeed';
            const result = 123;
            const nodesMap = new NodesMap(pipeline);
            const node = new Node({
                nodeName: green.nodeName,
                algorithmName: green.algorithmName,
                extraData: green.extraData,
                input: green.input
            });
            nodesMap.setNode(node);
            nodesMap.on('node-ready', node => {
                expect(node.nodeName).to.equal(yellow.nodeName);
                expect(node.nodeName).to.equal(pipeline.nodes[1].nodeName);
                expect(node.parentOutput).to.have.lengthOf(1);
                expect(node.parentOutput[0].node).to.equal(green.nodeName);
                expect(node.parentOutput[0].result).to.equal(result);
                expect(node.parentOutput[0].type).to.equal('waitNode');
            });
            const task = nodesMap.updateTaskState(node.taskId, { status, result });
            nodesMap.updateCompletedTask(task);
        });
        it('should run simple-wait-batch', () => {
            const pipeline = pipelines.find(p => p.name === 'simple-wait-batch');
            const green = pipeline.nodes[0];
            const yellow = pipeline.nodes[1];
            const black = pipeline.nodes[2];
            const nodesMap = new NodesMap(pipeline);
            const node0 = nodesMap.getNode(green.nodeName);
            const node1 = nodesMap.getNode(yellow.nodeName);
            const index = 1;
            const batch0 = new Batch({
                nodeName: node0.nodeName,
                batchIndex: index,
                algorithmName: node0.algorithmName,
                input: node0.input
            });
            const batch1 = new Batch({
                nodeName: node1.nodeName,
                batchIndex: index,
                algorithmName: node1.algorithmName,
                input: node1.input
            });
            nodesMap.addBatch(batch0);
            nodesMap.addBatch(batch1);
            nodesMap.updateTaskState(batch0.taskId, {
                status: 'succeed',
                result: 123
            });
            nodesMap.updateTaskState(batch1.taskId, {
                status: 'succeed',
                result: 456
            });
            nodesMap.updateCompletedTask(batch0);
            const nodeResults = nodesMap.updateCompletedTask(batch1);
            const node = nodeResults[0][0];
            expect(nodeResults).to.have.lengthOf(1);
            expect(node.nodeName).to.equal(black.nodeName);
            expect(node.index).to.equal(index);
            expect(node.parentOutput).to.have.lengthOf(4);
            expect(node.parentOutput[0].node).to.equal('green');
            expect(node.parentOutput[1].node).to.equal('yellow');
            expect(node.parentOutput[2].node).to.equal('green');
            expect(node.parentOutput[3].node).to.equal('yellow');

            expect(node.parentOutput[0].type).to.equal('waitNode');
            expect(node.parentOutput[1].type).to.equal('waitNode');
            expect(node.parentOutput[2].type).to.equal('waitAny');
            expect(node.parentOutput[3].type).to.equal('waitAny');
        });
        it('should run double-wait-any', () => {
            const pipeline = pipelines.find(p => p.name === 'double-wait-any');
            const black = pipeline.nodes[2];
            const result = 123;
            const nodesMap = new NodesMap(pipeline);
            let nodeResults = null;
            for (let i = 0; i < 2; i++) {
                const node = pipeline.nodes[i];
                for (let j = 0; j < 3; j++) {
                    const batch = new Batch({
                        nodeName: node.nodeName,
                        batchIndex: j + 1,
                        algorithmName: node.algorithmName,
                        input: node.input
                    });
                    nodesMap.addBatch(batch);
                }
            }
            for (let i = 0; i < 2; i++) {
                const pnode = pipeline.nodes[i];
                const node = nodesMap.getNode(pnode.nodeName);
                node.batch.forEach(b => {
                    nodesMap.updateTaskState(b.taskId, { status: 'succeed', result });
                    nodeResults = nodesMap.updateCompletedTask(b);
                    if (nodeResults.length > 0 && nodeResults[0].length > 0) {
                        const node = nodeResults[0][0];
                        expect(node.index).to.equal(b.batchIndex);
                        expect(node.nodeName).to.equal(black.nodeName);

                        expect(node.parentOutput[0].index).to.equal(b.batchIndex);
                        expect(node.parentOutput[0].node).to.equal('green');
                        expect(node.parentOutput[0].result).to.equal(result);
                        expect(node.parentOutput[0].type).to.equal('waitAny');

                        expect(node.parentOutput[1].index).to.equal(b.batchIndex);
                        expect(node.parentOutput[1].node).to.equal('yellow');
                        expect(node.parentOutput[1].result).to.equal(result);
                        expect(node.parentOutput[1].type).to.equal('waitAny');
                    }
                });
            }
        });
        it('should run complex-wait-any', () => {
            const pipeline = pipelines.find(p => p.name === 'complex-wait-any');
            const nodesMap = new NodesMap(pipeline);
            const black = pipeline.nodes[2];
            let nodeResults = null;
            for (let i = 0; i < 2; i++) {
                const node = pipeline.nodes[i];
                for (let j = 0; j < 3; j++) {
                    const batch = new Batch({
                        nodeName: node.nodeName,
                        batchIndex: j + 1,
                        algorithmName: node.algorithmName,
                        input: node.input
                    });
                    nodesMap.addBatch(batch);
                }
            }
            for (let i = 0; i < 2; i++) {
                const pnode = pipeline.nodes[i];
                const node = nodesMap.getNode(pnode.nodeName);
                node.batch.forEach(b => {
                    nodesMap.updateTaskState(b.taskId, {
                        status: 'succeed',
                        result: 123
                    });
                    nodesMap.updateCompletedTask(b);
                    nodeResults = nodesMap.updateCompletedTask(b);
                    if (nodeResults.length > 0 && nodeResults[0].length > 0) {
                        const node = nodeResults[0][0];
                        expect(node.nodeName).to.equal(black.nodeName);

                        expect(node.parentOutput[0].node).to.equal('green');
                        expect(node.parentOutput[1].node).to.equal('yellow');
                        expect(node.parentOutput[2].node).to.equal('green');
                        expect(node.parentOutput[3].node).to.equal('yellow');

                        expect(node.parentOutput[0].type).to.equal('waitNode');
                        expect(node.parentOutput[1].type).to.equal('waitNode');
                        expect(node.parentOutput[2].type).to.equal('waitAny');
                        expect(node.parentOutput[3].type).to.equal('waitAny');
                    }
                });
            }
        });
        it('should run simple-wait-any', () => {
            const pipeline = pipelines.find(p => p.name === 'simple-wait-any');
            const nodesMap = new NodesMap(pipeline);
            const black = pipeline.nodes[2];
            let nodeResults = null;
            for (let i = 0; i < 2; i++) {
                const node = pipeline.nodes[i];
                for (let j = 0; j < 3; j++) {
                    const batch = new Batch({
                        nodeName: node.nodeName,
                        batchIndex: j + 1,
                        algorithmName: node.algorithmName,
                        input: node.input
                    });
                    nodesMap.addBatch(batch);
                }
            }
            for (let i = 0; i < 2; i++) {
                const pnode = pipeline.nodes[i];
                const node = nodesMap.getNode(pnode.nodeName);
                node.batch.forEach(b => {
                    nodesMap.updateTaskState(b.taskId, {
                        status: 'succeed',
                        result: 123
                    });
                    nodeResults = nodesMap.updateCompletedTask(b);
                    if (nodeResults.length > 0 && nodeResults[0].length > 0) {
                        const node = nodeResults[0][0];
                        expect(node.index).to.equal(b.batchIndex);
                        expect(node.nodeName).to.equal(black.nodeName);

                        expect(node.parentOutput[0].node).to.equal('green');
                        expect(node.parentOutput[1].node).to.equal('green');
                        expect(node.parentOutput[2].node).to.equal('yellow');

                        expect(node.parentOutput[0].type).to.equal('waitNode');
                        expect(node.parentOutput[1].type).to.equal('waitAny');
                        expect(node.parentOutput[2].type).to.equal('waitAny');
                    }
                });
            }
        });
        it('should update algorithm execution', () => {
            const pipeline = pipelines.find(p => p.name === 'one-node');
            const node = pipeline.nodes[0];
            const nodesMap = new NodesMap(pipeline);
            const nodeName = node.nodeName;
            const algorithmName = 'new-algorithm';

            const execution1 = {
                nodeName: `${nodeName}:${algorithmName}`,
                parentNodeName: nodeName,
                taskId: `execId-${uuidv4()}`
            };
            const exec1 = nodesMap.updateAlgorithmExecution(execution1);
            expect(exec1.status).to.be.undefined;

            const execution2 = {
                nodeName: `${nodeName}:${algorithmName}`,
                parentNodeName: nodeName,
                taskId: execution1.taskId,
                status: 'succeed'
            };
            const exec2 = nodesMap.updateAlgorithmExecution(execution2);
            expect(exec2.status).to.equal(execution2.status);
        });
    });
    describe('addLevels', () => {
        it('should add levels to cycle graph', () => {
            const pipeline = pipelines.find(p => p.name === 'cycle-flow');
            const nodesMap = new NodesMap(pipeline);
            const nodes = nodesMap.getAllNodes();
            nodes.forEach(n => expect(n.level).to.least(0))
            expect(nodesMap.getNode('A').level).to.eql(0);
            expect(nodesMap.getNode('B').level).to.eql(1);
            expect(nodesMap.getNode('C').level).to.eql(1);
        });
        it('should add levels to graph 1', () => {
            const pipeline = pipelines.find(p => p.name === 'simple-flow');
            const nodesMap = new NodesMap(pipeline);
            const nodes = nodesMap.getAllNodes();
            nodes.forEach(n => expect(n.level).to.least(0))
            expect(nodesMap.getNode('green').level).to.eql(0);
            expect(nodesMap.getNode('yellow').level).to.eql(1);
            expect(nodesMap.getNode('black').level).to.eql(2);
            expect(nodesMap.getNode('white').level).to.eql(0);
        });
        it('should add levels to graph 2', () => {
            const pipeline = pipelines.find(p => p.name === 'flow2');
            const nodesMap = new NodesMap(pipeline);
            const nodes = nodesMap.getAllNodes();
            nodes.forEach(n => expect(n.level).to.least(0))
            expect(nodesMap.getNode('green').level).to.eql(0);
            expect(nodesMap.getNode('yellow').level).to.eql(1);
            expect(nodesMap.getNode('black').level).to.eql(1);
        });
        it('should add levels to graph 3', () => {
            const pipeline = pipelines.find(p => p.name === 'simple-wait-batch');
            const nodesMap = new NodesMap(pipeline);
            nodesMap.getAllNodes().forEach(n => expect(n.level).to.least(0))
            expect(nodesMap.getNode('green').level).to.eql(0);
            expect(nodesMap.getNode('yellow').level).to.eql(0);
            expect(nodesMap.getNode('black').level).to.eql(1);
        });
        it('should add levels to graph 4', () => {
            const pipeline = pipelines.find(p => p.name === 'vertical');
            const nodesMap = new NodesMap(pipeline);
            nodesMap.getAllNodes().forEach(n => expect(n.level).to.least(0))
            expect(nodesMap.getNode('node1').level, 'node1').to.eql(0);
            expect(nodesMap.getNode('node2').level, 'node2').to.eql(0);
            expect(nodesMap.getNode('node3').level, 'node3').to.eql(0);
            expect(nodesMap.getNode('node4').level, 'node4').to.eql(0);
            expect(nodesMap.getNode('node6').level, 'node6').to.eql(1);
            expect(nodesMap.getNode('node7').level, 'node7').to.eql(1);
            expect(nodesMap.getNode('node8').level, 'node8').to.eql(2);
        });
    });
    describe('Edges', () => {
        it('should create edge', () => {
            const pipeline = pipelines.find(p => p.name === 'simple-flow');
            const n1 = pipeline.nodes[0].nodeName;
            const n2 = pipeline.nodes[3].nodeName;
            const dag1 = new NodesMap(pipeline);
            const edge1 = dag1.getEdge(n1, n2);
            const dag2 = new NodesMap({ ...pipeline, edges: [{ source: n1, target: n2 }] });
            const edge2 = dag2.getEdge(n1, n2);
            expect(edge1).to.be.undefined;
            expect(edge2).to.have.property('types');
        });
        it('should getEdge', () => {
            const pipeline = pipelines.find(p => p.name === 'simple-flow');
            const n1 = pipeline.nodes[0].nodeName;
            const n2 = pipeline.nodes[1].nodeName;
            const nodesMap = new NodesMap(pipeline);
            const edge = nodesMap.getEdge(n1, n2);
            expect(edge).to.have.property('types');
        });
        it('should setEdge', () => {
            const pipeline = pipelines.find(p => p.name === 'simple-flow');
            const n1 = pipeline.nodes[0].nodeName;
            const n2 = pipeline.nodes[1].nodeName;
            const nodesMap = new NodesMap(pipeline);
            nodesMap.setEdge(n1, n2, { prop: 5 });
            const edge = nodesMap.getEdge(n1, n2)
            expect(edge).to.have.property('prop');
            expect(edge).to.not.have.property('types');
        });
        it('should updateEdge', () => {
            const pipeline = pipelines.find(p => p.name === 'simple-flow');
            const n1 = pipeline.nodes[0].nodeName;
            const n2 = pipeline.nodes[1].nodeName;
            const nodesMap = new NodesMap(pipeline);
            nodesMap.updateEdge(n1, n2, { prop: 5 });
            const edge = nodesMap.getEdge(n1, n2)
            expect(edge).to.have.property('prop');
            expect(edge).to.have.property('types');
        });
        it('should get edge types', () => {
            const pipeline = pipelines.find(p => p.name === 'simple-flow');
            const n1 = pipeline.nodes[0].nodeName;
            const n2 = pipeline.nodes[1].nodeName;
            const nodesMap = new NodesMap(pipeline);
            const types = nodesMap.getEdgeTypes(n1, n2);
            expect(types).to.have.lengthOf(2);
        });
        it('should get empty edge types', () => {
            const pipeline = pipelines.find(p => p.name === 'simple-flow');
            const n1 = pipeline.nodes[0].nodeName;
            const n2 = pipeline.nodes[3].nodeName;
            const nodesMap = new NodesMap(pipeline);
            const types = nodesMap.getEdgeTypes(n1, n2);
            expect(types).to.have.lengthOf(0);
        });
        it('should getEdges', () => {
            const pipeline = pipelines.find(p => p.name === 'simple-flow');
            const nodesMap = new NodesMap(pipeline);
            const n1 = pipeline.nodes[0].nodeName;
            const n2 = pipeline.nodes[1].nodeName;
            const n3 = pipeline.nodes[2].nodeName;
            nodesMap.setEdge(n1, n2, { prop: 5 });
            nodesMap.setEdge(n2, n3, { prop: 6 });
            const edges = nodesMap.getEdges();
            expect(edges[0].value).to.have.property('prop');
            expect(edges[1].value).to.have.property('prop');
        });
    });
    describe('State', () => {
        it('getNodeResults: should not able to get node results', () => {
            const nodesMap = new NodesMap(pipelines[0]);
            expect(() => nodesMap._getNodeResults('not_exists')).to.throw(`unable to find node not_exists`);
        });
        it('getNodeStates: should not able to get node states', () => {
            const nodesMap = new NodesMap(pipelines[0]);
            expect(() => nodesMap.getNodeStates('not_exists')).to.throw(`unable to find node not_exists`);
        });
        it('updateNodeState: should not able to update node status', () => {
            const nodesMap = new NodesMap(pipelines[0]);
            expect(() => nodesMap.updateTaskState('not_exists')).to.throw(`unable to find task not_exists`);
        });
        it('getNodeResults: should get batch results', () => {
            const pipeline = clone(pipelines[0]);
            const nodesMap = new NodesMap(pipeline);
            const node = pipeline.nodes[0];
            const result = { my: 'OK' };
            nodesMap.addBatch(
                new Batch({
                    nodeName: node.nodeName,
                    batchIndex: 1,
                    algorithmName: node.algorithmName,
                    result: result
                })
            );
            const results = nodesMap._getNodeResults(node.nodeName);
            expect(results[0]).to.deep.equal(result);
        });
        it('getNodeResults: should get node results', () => {
            const pipeline = clone(pipelines[0]);
            const nodesMap = new NodesMap(pipeline);
            const node = pipeline.nodes[0];
            const result = { my: 'OK' };
            nodesMap.setNode(
                new Node({
                    nodeName: node.nodeName,
                    algorithmName: node.algorithmName,
                    result: result
                })
            );
            const results = nodesMap._getNodeResults(node.nodeName);
            expect(results).to.deep.equal(result);
        });
        it('updateNodeState: should update node status', () => {
            const pipeline = clone(pipelines[0]);
            const nodeName = pipeline.nodes[0].nodeName;
            const nodesMap = new NodesMap(pipeline);
            const node = nodesMap.getNode(nodeName);
            node.taskId = 'should update node status';
            const options = {
                status: 'complete',
                result: { my: 'OK' }
            };
            nodesMap.updateTaskState(node.taskId, options);
            const states = nodesMap.getNodeStates(node.nodeName);
            expect(states[0]).to.equal(options.status);
        });
        it('updateNodeState: should update batch status', () => {
            const pipeline = clone(pipelines[0]);
            const node = pipeline.nodes[0];
            const nodesMap = new NodesMap(pipeline);
            const options = {
                status: 'complete',
                result: { my: 'OK' }
            };
            const batch = new Batch({
                taskId: 'should update batch status',
                nodeName: node.nodeName,
                batchIndex: 1
            });
            nodesMap.addBatch(batch);
            nodesMap.updateTaskState(batch.taskId, options);
            const states = nodesMap.getNodeStates(node.nodeName);
            expect(states[0]).to.equal(options.status);
        });
        it('isAllNodesCompleted: should return false', () => {
            const pipeline = clone(pipelines[0]);
            const node = pipeline.nodes[0];
            const nodesMap = new NodesMap(pipeline);
            nodesMap.addBatch(
                new Batch({
                    nodeName: node.nodeName,
                    batchIndex: 1,
                    status: 'complete'
                })
            );
            const result = nodesMap.isAllNodesCompleted();
            expect(result).to.equal(false);
        });
        it('getAllNodes: should return all nodes', () => {
            const pipeline = clone(pipelines[0]);
            const node = pipeline.nodes[0];
            const nodesMap = new NodesMap(pipeline);
            nodesMap.addBatch(
                new Batch({
                    nodeName: node.nodeName,
                    batchIndex: 1,
                    status: 'complete'
                })
            );
            const result = nodesMap.getAllNodes();
            const resultNodes = result.map(r => r.nodeName);
            const pipelineNodes = pipeline.nodes.map(r => r.nodeName);
            expect(resultNodes).to.have.lengthOf(4);
            expect(resultNodes).to.deep.equal(pipelineNodes);
        });
        it('isAllParentsFinished: should return false', () => {
            const pipeline = clone(pipelines[0]);
            const yellow = pipeline.nodes[1];
            const nodesMap = new NodesMap(pipeline);
            const result = nodesMap.isAllParentsFinished(yellow.nodeName);
            expect(result).to.equal(false);
        });
        it('pipelineResults: should return array', () => {
            const pipeline = clone(pipelines[0]);
            const nodesMap = new NodesMap(pipeline);
            const result = nodesMap.pipelineResults();
            expect(result).to.have.lengthOf(2);
        });
    });
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
});
