#!/usr/bin/env node
import * as cdk from "aws-cdk-lib";
import { CdkDynamoStack } from "../lib/cdk-dynamoDB-stack";
import { CdkRdsStack } from "../lib/cdk-rds-stack";
import { CdkEcsStack } from "../lib/cdk-ecs-and-apigateway-stack";

const app = new cdk.App();

// DynamoDB Stack
new CdkDynamoStack(app, "CleanServerlessBookDynamoStack");

// APIGateway + ECS Stack
new CdkEcsStack(app, "CleanServerlessBookSampleEcsStack");

// RDS Stack
new CdkRdsStack(app, "CleanServerlessBookSampleRdsStack");
