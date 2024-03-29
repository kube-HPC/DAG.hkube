const { expect } = require('chai');
const NodesMap = require('../lib/dag/dag');
const pipelines = require('./pipelines.json');

describe('Validation', () => {
    it('should throw missing algorithmName', () => {
        const pipeline = {
            name: "pipeline",
            nodes: [{
                nodeName: "A",
                kind: "algorithm",
                input: ["data"],
            }]
        }
        expect(() => new NodesMap(pipeline)).to.throw('please provide algorithm name');
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
        expect(() => new NodesMap(pipeline)).to.throw('please provide pipeline name');
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
    it('should throw node depend on an output node', () => {
        const pipeline = {
            name: "pipeline",
            nodes: [{
                nodeName: "A",
                algorithmName: "green-alg",
                input: [],
            },
            {
                nodeName: "B",
                algorithmName: "green-alg",
                kind: "output",
                input: ["@A"],
            }, {
                nodeName: "C",
                algorithmName: "green-alg",
                input: ["@B"],
            }]
        }
        expect(() => new NodesMap(pipeline)).to.throw('node "B" should not have child nodes');
    });
    it('should throw node output must depend', () => {
        const pipeline = {
            name: "pipeline",
            nodes: [{
                nodeName: "A",
                algorithmName: "green-alg",
                input: [],
            },
            {
                nodeName: "B",
                algorithmName: "green-alg",
                kind: "output",
                input: [],
            }]
        }
        expect(() => new NodesMap(pipeline)).to.throw('node "B" should have parent nodes');
    });
    it('should throw no output node in streaming', () => {
        const pipeline = {
            name: "pipeline",
            kind: "stream",
            nodes: [{
                nodeName: "A",
                kind: "output",
                algorithmName: "green-alg",
                input: ["data"]
            }]
        }
        expect(() => new NodesMap(pipeline)).to.throw('node "A" from kind output can not be used in a streaming pipeline');
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