import { Stack, StackProps } from "aws-cdk-lib";
import { Construct } from "constructs";
import * as cdk from "aws-cdk-lib";
import * as ec2 from "aws-cdk-lib/aws-ec2";
import * as rds from "aws-cdk-lib/aws-rds";

export class CdkRdsStack extends Stack {
  constructor(scope: Construct, id: string, props?: StackProps) {
    super(scope, id, props);
    const resourceName = "clean-serverless";
    // Get AWS Account ID and Region
    const { accountId, region } = new cdk.ScopedAws(this);

    // RDS (MySQL)
    // Create Subnet Group
    const dbName: string = "testdb";

    const rdsCredentials: rds.Credentials = rds.Credentials.fromGeneratedSecret(
      "rds_credentials",
      {
        secretName: `/${resourceName}/rds/`,
      }
    );

    const rds_vpc: ec2.Vpc = new ec2.Vpc(this, "VPC", {
      enableDnsHostnames: true,
      enableDnsSupport: true,
      maxAzs: 2,
      subnetConfiguration: [
        {
          name: "privateSubnet",
          subnetType: ec2.SubnetType.PRIVATE_ISOLATED,
          cidrMask: 24,
          reserved: false,
        },
      ],
    });

    // Create Security Group
    const rdsSecGroup = new ec2.SecurityGroup(this, "clean-archi-rds-sg", {
      securityGroupName: "clean-archi-rds-sg",
      vpc: rds_vpc,
      allowAllOutbound: false,
    });

    // Create RDS Instance (MySQL)
    const rdsInstance = new rds.DatabaseInstance(this, "RdsInstance", {
      engine: rds.DatabaseInstanceEngine.mysql({
        version: rds.MysqlEngineVersion.VER_8_0_34,
      }),
      instanceType: ec2.InstanceType.of(
        ec2.InstanceClass.T3,
        ec2.InstanceSize.MICRO
      ),
      credentials: rdsCredentials,
      databaseName: dbName,
      vpc: rds_vpc,
      vpcSubnets: {
        subnetType: ec2.SubnetType.PRIVATE_ISOLATED,
      },
      networkType: rds.NetworkType.IPV4,
      securityGroups: [rdsSecGroup],
      availabilityZone: "ap-northeast-1a",
    });
  }
}
