#!/usr/bin/env node
import * as cdk from 'aws-cdk-lib';
import { TestLambdaPipelineStack } from '../lib/test-lambda-code-pipeline-stack';
import { TestLambdaPipelineStack2 } from '../lib/test-lambda-code-pipeline-stack-2';

const app = new cdk.App();

let StackToDeploy = 'TestLambdaPipelineStack';

if(StackToDeploy == 'TestLambdaPipelineStack'){
    new TestLambdaPipelineStack(app, 'TestLambdaPipelineStack', {
    });
}

else if(StackToDeploy == 'TestLambdaPipelineStack2'){
    new TestLambdaPipelineStack2(app, 'TestLambdaPipelineStack2', {
    });
}

else {
    console.error('Invalid stack name');
    process.exit(1);
}


