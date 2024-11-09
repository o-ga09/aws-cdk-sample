import { Construct } from "constructs";
import * as cdk from "aws-cdk-lib";
import * as ecs from "aws-cdk-lib/aws-ecs";
import * as ec2 from "aws-cdk-lib/aws-ec2";
import * as ecr from "aws-cdk-lib/aws-ecr";
import * as logs from "aws-cdk-lib/aws-logs";
import * as ecrdeploy from "cdk-ecr-deployment";
import * as secrets from "aws-cdk-lib/aws-secretsmanager";
import * as path from "path";
import { DockerImageAsset, Platform } from "aws-cdk-lib/aws-ecr-assets";
import { NetworkLoadBalancer } from "aws-cdk-lib/aws-elasticloadbalancingv2";
import {
  Effect,
  PolicyStatement,
  Role,
  ServicePrincipal,
} from "aws-cdk-lib/aws-iam";
import { RemovalPolicy, Stack, StackProps } from "aws-cdk-lib";
import {
  AccessLogFormat,
  ConnectionType,
  Integration,
  IntegrationType,
  LogGroupLogDestination,
  RestApi,
  VpcLink,
} from "aws-cdk-lib/aws-apigateway";
import * as dotenv from "dotenv";

export class CdkEcsStack extends Stack {
  constructor(scope: Construct, id: string, props?: StackProps) {
    super(scope, id, props);

    const resourceName = "clean-serverless";

    // Get AWS Account ID and Region
    const { accountId, region } = new cdk.ScopedAws(this);

    // Create VPC Link
    const vpc = new ec2.Vpc(this, "Vpc", {
      vpcName: `${resourceName}-vpc`,
      maxAzs: 2,
      ipAddresses: ec2.IpAddresses.cidr("10.0.0.0/20"),
      natGateways: 1,
      natGatewaySubnets: {
        subnetType: ec2.SubnetType.PUBLIC,
      },
      subnetConfiguration: [
        {
          cidrMask: 24,
          name: `${resourceName}-private`,
          subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS,
        },
        {
          cidrMask: 24,
          name: `${resourceName}-public`,
          subnetType: ec2.SubnetType.PUBLIC,
        },
      ],
    });

    // Create NLB
    const nlb = new NetworkLoadBalancer(this, "clean-archi-api-nlb", {
      vpc: vpc,
      internetFacing: false,
    });

    // NLB にport 8080のリスナーを追加
    const listener = nlb.addListener("clean-archi-api-listener", {
      port: 8080,
    });

    // Create Security Group
    const secGroup = new ec2.SecurityGroup(this, "clean-archi-api-sg", {
      securityGroupName: "clean-archi-api-sg",
      vpc: vpc,
      allowAllOutbound: true,
    });

    // Security GroupにIngressルールを追加
    secGroup.addIngressRule(
      ec2.Peer.ipv4("0.0.0.0/0"),
      ec2.Port.tcp(80),
      "SSH frm anywhere"
    );
    secGroup.addIngressRule(ec2.Peer.ipv4("0.0.0.0/0"), ec2.Port.tcp(8080), "");

    const paths = [
      {
        method: "DELETE",
        apiPath: "v1/users/{user_id}/microposts/{micropost_id}",
      },
      { method: "DELETE", apiPath: "v1/users/{user_id}" },
      {
        method: "GET",
        apiPath: "v1/users/{user_id}/microposts/{micropost_id}",
      },
      {
        method: "GET",
        apiPath: "v1/users/{user_id}/microposts",
      },
      { method: "GET", apiPath: "v1/users/{user_id}" },
      { method: "GET", apiPath: "v1/users" },
      {
        method: "POST",
        apiPath: "v1/users/{user_id}/microposts",
      },
      { method: "POST", apiPath: "v1/users" },
      {
        method: "PUT",
        apiPath: "v1/users/{user_id}/microposts/{micropost_id}",
      },
      { method: "PUT", apiPath: "v1/users/{user_id}" },
    ];

    // API Gateway
    const api = new RestApi(this, "dev-main-apigw", {
      restApiName: "dev-main-apigw",
      deployOptions: {
        stageName: "v1",
        accessLogDestination: new LogGroupLogDestination(
          new logs.LogGroup(this, "dev-main-apigw-log-group", {
            logGroupName: "/aws/apigateway/dev-main-apigw",
            removalPolicy: RemovalPolicy.DESTROY,
          })
        ),
        accessLogFormat: AccessLogFormat.jsonWithStandardFields(),
      },
      cloudWatchRole: true,
    });

    // VPC Link
    const vpclink = new VpcLink(this, "dev-main-vpclink", {
      targets: [nlb],
      vpcLinkName: "dev-main-vpclink",
    });

    // APIGateway Method 追加
    paths.forEach((path) => {
      // VPC Integration
      const vpc_integration = new Integration({
        type: IntegrationType.HTTP_PROXY,
        integrationHttpMethod: path.method,
        uri: `http://${nlb.loadBalancerDnsName}:8080/${path.apiPath}`,
        options: {
          connectionType: ConnectionType.VPC_LINK,
          vpcLink: vpclink,
          requestParameters: {
            "integration.request.header.Content-Type": "'application/json'",
            "integration.request.path.user_id": "method.request.path.user_id",
            "integration.request.path.micropost_id":
              "method.request.path.micropost_id",
          },
          integrationResponses: [
            {
              statusCode: "200",
              responseTemplates: {
                "application/json": "",
              },
            },
          ],
        },
      });
      api.root
        .resourceForPath(path.apiPath)
        .addMethod(path.method, vpc_integration, {
          requestParameters: {
            "method.request.path.user_id": true,
            "method.request.path.micropost_id": true,
          },
          methodResponses: [
            {
              statusCode: "200",
              responseParameters: {
                "method.response.header.Content-Type": true,
              },
            },
          ],
        });
    });

    // ECR Repository
    const ecrRepository = new ecr.Repository(this, "EcrRepo", {
      repositoryName: `${resourceName}-ecr-repo`,
      removalPolicy: RemovalPolicy.DESTROY,
      autoDeleteImages: true,
    });

    // Docker Image
    const dockerImageAsset = new DockerImageAsset(this, "DockerImageAsset", {
      directory: path.join(__dirname, "..", "..", "app"),
      platform: Platform.LINUX_AMD64,
      target: "deploy-api",
    });

    // Push Docker Image to ECR
    new ecrdeploy.ECRDeployment(this, "DeployDockerImage", {
      src: new ecrdeploy.DockerImageName(dockerImageAsset.imageUri),
      dest: new ecrdeploy.DockerImageName(
        `${accountId}.dkr.ecr.${region}.amazonaws.com/${ecrRepository.repositoryName}:latest`
      ),
    });

    // ECS Execution Role
    const execRole = new Role(this, "search-api-exec-role", {
      roleName: "social-api-role",
      assumedBy: new ServicePrincipal("ecs-tasks.amazonaws.com"),
    });

    // ECS Task Roleにポリシーを追加
    execRole.addToPolicy(
      new PolicyStatement({
        actions: [
          "ecr:GetAuthorizationToken",
          "ecr:BatchCheckLayerAvailability",
          "ecr:GetDownloadUrlForLayer",
          "ecr:BatchGetImage",
          "logs:CreateLogStream",
          "logs:PutLogEvents",
          "dynamodb:Query",
          "dynamodb:Scan",
          "dynamodb:GetItem",
          "dynamodb:PutItem",
          "dynamodb:UpdateItem",
          "dynamodb:DeleteItem",
        ],
        effect: Effect.ALLOW,
        resources: ["*"],
      })
    );

    // ECS Cluster
    const cluster = new ecs.Cluster(this, "EcsCluster", {
      clusterName: `${resourceName}-cluster`,
      vpc: vpc,
    });

    // ECS CloudWatch Log Group
    const logGroup = new logs.LogGroup(this, "LogGroup", {
      logGroupName: `/aws/ecs/${resourceName}`,
      removalPolicy: RemovalPolicy.DESTROY,
    });

    // ECS Task定義
    const taskDef = new ecs.FargateTaskDefinition(this, "search-api-task", {
      family: "search-api-task",
      memoryLimitMiB: 512,
      cpu: 256,
      executionRole: execRole,
      taskRole: execRole,
    });

    taskDef
      .addContainer("search-api-container", {
        image: ecs.ContainerImage.fromEcrRepository(ecrRepository, "latest"),
        memoryLimitMiB: 512,
        cpu: 256,
        logging: ecs.LogDrivers.awsLogs({
          streamPrefix: "search-api-container",
          logGroup: logGroup,
        }),
        secrets: {
          DB_USER: ecs.Secret.fromSecretsManager(
            secrets.Secret.fromSecretAttributes(this, "username", {
              secretCompleteArn: process.env.SECRETS_ARN,
            })
          ),
          DB_PASS: ecs.Secret.fromSecretsManager(
            secrets.Secret.fromSecretAttributes(this, "password", {
              secretCompleteArn: process.env.SECRETS_ARN,
            })
          ),
          DB_NAME: ecs.Secret.fromSecretsManager(
            secrets.Secret.fromSecretAttributes(this, "dbname", {
              secretCompleteArn: process.env.SECRETS_ARN,
            })
          ),
          DB_HOST: ecs.Secret.fromSecretsManager(
            secrets.Secret.fromSecretAttributes(this, "host", {
              secretCompleteArn: process.env.SECRETS_ARN,
            })
          ),
        },
        environment: {
          PORT: "80",
          DYNAMO_TABLE_NAME: "ResourceTable",
          DYNAMO_PK_NAME: "PK",
          DYNAMO_SK_NAME: "SK",
        },
      })
      .addPortMappings({
        containerPort: 80,
        hostPort: 80,
        protocol: ecs.Protocol.TCP,
      });

    // ECS on Fargate
    const fargateService = new ecs.FargateService(
      this,
      "search-api-fg-service",
      {
        cluster,
        taskDefinition: taskDef,
        assignPublicIp: false,
        serviceName: "search-api-svc",
        securityGroups: [secGroup],
      }
    );

    // ECS にTarget Groupを追加
    listener.addTargets("clean-archi-api-tg", {
      targetGroupName: "clean-archi-api-tg",
      port: 80,
      targets: [fargateService],
      deregistrationDelay: cdk.Duration.seconds(300),
    });
  }
}
