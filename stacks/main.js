const cdk = require('@aws-cdk/core');
const s3 = require('@aws-cdk/aws-s3');
const cloudfront = require('@aws-cdk/aws-cloudfront');
const lambda = require('@aws-cdk/aws-lambda');
const iam = require('@aws-cdk/aws-iam');
const logs = require('@aws-cdk/aws-logs');

const cdkApp = new cdk.App();

const stack = new cdk.Stack(cdkApp, 'carlovsk-lambda-at-edge-2', {
  env: { region: 'us-east-1' },
});

const edgeRole = new iam.Role(stack, 'LambdaAtEdgeRole', {
  assumedBy: new iam.CompositePrincipal(
    new iam.ServicePrincipal('lambda.amazonaws.com'),
    new iam.ServicePrincipal('edgelambda.amazonaws.com'),
    new iam.ServicePrincipal('cloudfront.amazonaws.com'),
    new iam.ServicePrincipal('cloudwatch.amazonaws.com'),
  ),
  roleName: 'LambdaAtEdgeRole',
});

const edgeLogGroup = new logs.LogGroup(stack, 'LambdaAtEdgeLogGroup', {
  logGroupName: 'LambdaAtEdgeLogGroup',
});

const edge = new lambda.Function(stack, 'LambdaAtEdge', {
  runtime: lambda.Runtime.NODEJS_14_X,
  handler: 'edge.handler',
  code: lambda.Code.fromAsset('./lambdas'),
  role: iam.Role.fromRoleArn(stack, 'EdgeRoleArn', edgeRole.roleArn),
  logRetention: logs.RetentionDays.ONE_WEEK,
  logGroup: edgeLogGroup,
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
    effect: iam.Effect.ALLOW,
    actions: ['logs:CreateLogGroup'],
    resources: [
      'arn:aws:logs:us-east-1:091958328764:*',
    ],
  }),
);

edgeRole.addToPolicy(
  new iam.PolicyStatement({
    effect: iam.Effect.ALLOW,
    actions: ['logs:CreateLogStream', 'logs:PutLogEvents'],
    resources: [
      'arn:aws:logs:us-east-1:091958328764:log-group:*',
    ],
  }),
);


const bucket = new s3.Bucket(stack, 'MainBucket', {
  accessControl: s3.BucketAccessControl.PUBLIC_READ,
  bucketName: `carlovsk-lambda-at-edge-2`,
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
