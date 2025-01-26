import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as codepipeline from 'aws-cdk-lib/aws-codepipeline';
import * as codepipeline_actions from 'aws-cdk-lib/aws-codepipeline-actions';
import * as codebuild from 'aws-cdk-lib/aws-codebuild';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as codecommit from 'aws-cdk-lib/aws-codecommit';
import * as iam from 'aws-cdk-lib/aws-iam';


export class TestLambdaPipelineStack extends cdk.Stack {
    constructor(scope: Construct, id: string, props?: cdk.StackProps) {
        super(scope, id, props);

        const branchVariable = new codepipeline.Variable({
            variableName: 'branchName',
            defaultValue: 'bronze',
            description: 'The branch to use for the pipeline',
        });

        const ecrTagVariable = new codepipeline.Variable({
            variableName: 'ecrTag',
            defaultValue: 'latest', // Default ECR tag
            description: 'The ECR tag to use for the Docker image',
        });

        const lambdaNameVariable = new codepipeline.Variable({
          variableName: 'lambdaName',
          defaultValue: 'test_lambda', // Default ECR tag
          description: 'Lambda function name on which the Docker image will be deployed',
        });


        const codeCommitRepoNameVariable = new codepipeline.Variable({
            variableName: 'codeCommitRepo',
            defaultValue: 'pysst_metastore', // Default ECR tag
            description: 'CodeCommit repository name',
        });

        const ecrRepoNameVariable = new codepipeline.Variable({
            variableName: 'ecrRepo',
            defaultValue: 'test_lambda', // Default ECR tag
            description: 'ecr repository name',
        });



        // S3 Bucket for storing artifacts
        const artifactBucket = new s3.Bucket(this, 'ParserPipelineArtifactBucket');

        const sourceArtifact = new codepipeline.Artifact();
        const buildArtifact = new codepipeline.Artifact();

        const codeCommitRepo = codecommit.Repository.fromRepositoryName(
            this,
            'CodeCommitRepo',
            'pysst_metastore' // Replace with your CodeCommit repository name
        );

        // IAM Roles for CodeBuild
        const buildRole = new iam.Role(this, 'BuildRole', {
            assumedBy: new iam.ServicePrincipal('codebuild.amazonaws.com'),
            managedPolicies: [
                iam.ManagedPolicy.fromAwsManagedPolicyName('AmazonEC2ContainerRegistryPowerUser'),
            ],
        });

        const deployRole = new iam.Role(this, 'DeployRole', {
            assumedBy: new iam.ServicePrincipal('codebuild.amazonaws.com'),
            managedPolicies: [
                iam.ManagedPolicy.fromAwsManagedPolicyName('AWSLambda_FullAccess'),
            ],
        });

        // Source Action for CodeCommit
        const sourceAction = new codepipeline_actions.CodeCommitSourceAction({
            actionName: 'CodeCommit_Source',
            repository: codeCommitRepo,
            branch: 'bronze',
            output: sourceArtifact,
        });
        // Build Action
        const buildProject = new codebuild.PipelineProject(this, 'BuildProject', {
            role: buildRole,
            environment: {
                buildImage: codebuild.LinuxBuildImage.STANDARD_5_0, // Supports Docker builds
                privileged: true, // Required for Docker builds
            },
            buildSpec: codebuild.BuildSpec.fromObject({
                version: '0.2',
                phases: {
                    install: {
                        commands: [
                            'docker --version', // Ensure Docker is available
                        ],
                    },
                    pre_build: {
                        commands: [
                            'echo Cloning the repository',
                            'git clone -b $BRANCH_NAME https://fsaleem+1-at-722365352638:FeUkMKQdaWJl97ebPpT9Z5I1reK39bz8YV8SiTgZpyw=@git-codecommit.us-east-1.amazonaws.com/v1/repos/$CODE_COMMIT_REPO_NAME',
                            // 'git clone -b $BRANCH_NAME https://********:*******@git-codecommit.eu-north-1.amazonaws.com/v1/repos/$CODE_COMMIT_REPO_NAME',
                            'cd $CODE_COMMIT_REPO_NAME',
                            'ls -al',

                            'echo Logging in to Amazon ECR',
                            `aws ecr get-login-password --region region | docker login --username AWS --password-stdin account_id.dkr.ecr.region.amazonaws.com`,

                        ],
                    },
                    build: {
                        commands: [
                            'echo Building the Docker image',
                            'docker build -t app .',
                            'docker tag app:latest account_id.dkr.ecr.region.amazonaws.com/$ECR_REPO_NAME:$ECR_TAG',
                        ],
                    },
                    post_build: {
                        commands: [
                            'echo Pushing the Docker image to ECR',
                            'docker push account_id.dkr.ecr.region.amazonaws.com/$ECR_REPO_NAME:$ECR_TAG',
                        ],
                    },
                }
            }),
        });

        const buildAction = new codepipeline_actions.CodeBuildAction({
            actionName: 'Build',
            project: buildProject,
            input: sourceArtifact,
            outputs: [buildArtifact],
            environmentVariables: {
                BRANCH_NAME: { value: branchVariable.reference() },
                ECR_TAG: { value: ecrTagVariable.reference() },
                LAMBDA_NAME: { value: lambdaNameVariable.reference() },
                ECR_REPO_NAME: { value: ecrRepoNameVariable.reference() },
                CODE_COMMIT_REPO_NAME: { value: codeCommitRepoNameVariable.reference()}
            },
        });

        // Deploy Action: Update Lambda Function with the Latest Docker Image
        const deployProject = new codebuild.PipelineProject(this, 'DeployProject', {
            role: deployRole,
            environment: {
                buildImage: codebuild.LinuxBuildImage.STANDARD_5_0,
            },
            buildSpec: codebuild.BuildSpec.fromObject({
                version: '0.2',
                phases: {
                    pre_build: {
                        commands: [
                            'echo Preparing to deploy Docker image to Lambda',
                        ],
                    },
                    build: {
                        commands: [
                            'echo Updating Lambda function with the latest Docker image',
                            `aws lambda update-function-code \
                  --function-name $LAMBDA_NAME \
                  --image-uri account_id.dkr.ecr.region.amazonaws.com/$ECR_REPO_NAME:$ECR_TAG`,
                        ],
                    },
                    post_build: {
                        commands: [
                            'echo Deployment to Lambda completed',
                        ],
                    },
                },
            }),
        });


        const deployAction = new codepipeline_actions.CodeBuildAction({
            actionName: 'Deploy',
            project: deployProject,
            input: sourceArtifact, // Provide an empty artifact to satisfy the required 'input' field
            environmentVariables: {
                BRANCH_NAME: { value: branchVariable.reference() },
                ECR_TAG: { value: ecrTagVariable.reference() },
                LAMBDA_NAME: { value: lambdaNameVariable.reference() },
                ECR_REPO_NAME: { value: ecrRepoNameVariable.reference() },
                CODE_COMMIT_REPO_NAME: { value: codeCommitRepoNameVariable.reference()}

            },
        });
        // Define the Pipeline
        const pipeline = new codepipeline.Pipeline(this, 'CodePipelineTestLambda', {
            pipelineName: 'CodePipelineTestLambda',
            artifactBucket: artifactBucket,
            stages: [
                {
                    stageName: 'Source',
                    actions: [sourceAction],
                },
                {
                    stageName: 'Build',
                    actions: [buildAction],
                },

                {
                    stageName: 'Deploy',
                    actions: [deployAction],
                },
            ],
        });
        pipeline.addVariable(branchVariable);
        pipeline.addVariable(ecrTagVariable);
        pipeline.addVariable(lambdaNameVariable);
        pipeline.addVariable(codeCommitRepoNameVariable);
        pipeline.addVariable(ecrRepoNameVariable);

    }
}