const chai = require('chai');
const chaiAsPromised = require('chai-as-promised');
const sinon = require('sinon');
const clone = require('clone');
const uuidv4 = require('uuid/v4');
const NodesMap = require('../lib/nodes/nodes-map');
const Node = require('../lib/nodes/node');
const Batch = require('../lib/nodes/node-batch');
const pipelines = require('./pipelines.json');
const expect = chai.expect;
chai.use(chaiAsPromised);

describe('NodesMap', () => {
	describe('Graph', () => {
		it('findEntryNodes: should find entry nodes', () => {
			const pipeline = pipelines.find(p => p.name === 'simple-wait-batch');
			const firstNode = pipeline.nodes[0];
			const nodesMap = new NodesMap(pipeline);
			const entryNodes = nodesMap.findEntryNodes();
			expect(entryNodes[0]).to.equal(firstNode.nodeName);
		});
		it('getNode: should get node by name', () => {
			const pipeline = pipelines.find(p => p.name === 'simple-wait-batch');
			const firstNode = pipeline.nodes[0];
			const nodesMap = new NodesMap(pipeline);
			const node = nodesMap.getNode(firstNode.nodeName);
			expect(node.nodeName).to.equal(firstNode.nodeName);
		});
		it('getNode: should not get node by name', () => {
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

			const execution1 = {
				nodeName: node.nodeName,
				algorithmName: 'new-algorithm',
				execId: `execId-${uuidv4()}`
			};
			const exec1 = nodesMap.updateAlgorithmExecution(execution1);
			expect(exec1.status).to.be.undefined;

			const execution2 = {
				nodeName: node.nodeName,
				algorithmName: 'new-algorithm',
				execId: execution1.execId,
				status: 'succeed'
			};
			const exec2 = nodesMap.updateAlgorithmExecution(execution2);
			expect(exec2.status).to.equal(execution2.status);
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
		it('should calc progress', () => {
			const pipeline = clone(pipelines[0]);
			const nodesMap = new NodesMap(pipeline);
			const result = nodesMap.calcProgress();
			expect(result).to.have.property('progress');
			expect(result).to.have.property('details');
			expect(result.progress).to.equal(0);
			expect(result.details).to.equal('0% completed, 4 creating');
		});
	});
});
