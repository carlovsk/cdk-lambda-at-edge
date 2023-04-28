const cdk = require('@aws-cdk/core');
const s3 = require('@aws-cdk/aws-s3');
const cloudfront = require('@aws-cdk/aws-cloudfront');
const lambda = require('@aws-cdk/aws-lambda');
const iam = require('@aws-cdk/aws-iam');
const logs = require('@aws-cdk/aws-logs');
const ssm = require('@aws-cdk/aws-ssm');

const { username, password } = require('./env');

const cdkApp = new cdk.App();

const stack = new cdk.Stack(cdkApp, 'charles-lambda-at-edge', {
  env: { region: 'us-east-1' },
});

const usernameParameter = new ssm.StringParameter(stack, 'Username', {
  parameterName: '/lambda-at-edge/username',
  stringValue: username,
});

const passwordParameter = new ssm.StringParameter(stack, 'Password', {
  parameterName: '/lambda-at-edge/password',
  stringValue: password,
});

const edgeRole = new iam.Role(stack, 'LambdaAtEdgeRole', {
  assumedBy: new iam.CompositePrincipal(
    new iam.ServicePrincipal('lambda.amazonaws.com'),
    new iam.ServicePrincipal('edgelambda.amazonaws.com'),
    new iam.ServicePrincipal('cloudfront.amazonaws.com'),
    new iam.ServicePrincipal('ssm.amazonaws.com'),
  ),
  roleName: 'LambdaAtEdgeRole',
});

const edge = new lambda.Function(stack, 'LambdaAtEdge', {
  runtime: lambda.Runtime.NODEJS_14_X,
  handler: 'edge.handler',
  code: lambda.Code.fromAsset('./lambdas'),
  role: iam.Role.fromRoleArn(stack, 'EdgeRoleArn', edgeRole.roleArn),
  logRetention: logs.RetentionDays.ONE_WEEK,
});

edgeRole.addToPolicy(
  new iam.PolicyStatement({
    actions: ['lambda:InvokeFunction'],
    resources: [edge.functionArn],
    conditions: {
      'ArnLike': {
        'AWS:SourceArn': `arn:aws:cloudfront:*`,
      },
    },
  })
);

edgeRole.addToPolicy(
  new iam.PolicyStatement({
    actions: ['ssm:GetParameter'],
    resources: ['arn:aws:ssm:*:*:parameter/lambda-at-edge/*'],
  })
);

const bucket = new s3.Bucket(stack, 'MainBucket', {
  bucketName: `charles-lambda-at-edge`,
  websiteIndexDocument: 'index.html',
  websiteErrorDocument: 'index.html',
});

new cloudfront.CloudFrontWebDistribution(stack, 'StaticDistribution', {
  originConfigs: [
    {
      s3OriginSource: {
        s3BucketSource: bucket
      }, behaviors: [
        {
          isDefaultBehavior: true,
          compress: true,
          allowedMethods: cloudfront.CloudFrontAllowedMethods.GET_HEAD,
          forwardedValues: {
            queryString: true,
            headers: ['Authorization', 'authorizations'],
          },
          lambdaFunctionAssociations: [
            {
              eventType: cloudfront.LambdaEdgeEventType.ORIGIN_REQUEST,
              lambdaFunction: edge.currentVersion,
              includeHeaders: ['Authorization']
            }
          ]
        },
      ],
    },
  ],
  httpVersion: cloudfront.HttpVersion.HTTP2,
  defaultRootObject: 'index.html',
  errorConfigurations: [
    {
      errorCachingMinTtl: 300, errorCode: 404, responseCode: 200, responsePagePath: '/' + 'index.html',
    },
    {
      errorCachingMinTtl: 300, errorCode: 403, responseCode: 200, responsePagePath: '/' + 'index.html',
    },
  ],
  viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
});
