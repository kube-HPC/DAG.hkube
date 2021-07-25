const { expect } = require('chai');
const { uuid: uuidv4 } = require('@hkube/uid');
const NodesMap = require('../lib/graph/nodes-map');
const Node = require('../lib/graph/node');
const Batch = require('../lib/graph/node-batch');
const pipelines = require('./pipelines.json');

describe('DAG', () => {
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
});