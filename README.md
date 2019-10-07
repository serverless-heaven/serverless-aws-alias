[![Serverless][ico-serverless]][link-serverless]
[![License][ico-license]][link-license]
[![NPM][ico-npm]][link-npm]
[![npm][ico-npm-downloads]][link-npm]
[![Build Status][ico-build]][link-build]
[![Coverage Status][ico-coverage]][link-coverage]
[![Contributors][ico-contributors]][link-contributors]

# Serverless AWS alias plugin

**The plugin requires Serverless 1.12 or later!**

This plugin enables use of AWS aliases on Lambda functions. The term alias must not
be mistaken as the stage. Aliases can be deployed to stages, e.g. if you work on
different VCS branches in the same service, you can deploy your branch to a
new alias. The alias deployment can contain a different set of functions (newly
added ones or removed ones) and does not impact any other deployed alias.
Aliases also can be used to provide a 'real' version promotion.

As soon as the service is deployed with the plugin activated, it will create
a default alias that is named equally to the stage. This is the master alias
for the stage.

Each alias creates a CloudFormation stack that is dependent on the stage stack.
This approach has multiple advantages including easy removal of any alias deployment,
protecting the aliased function versions, and many more.

## Installation

Add the plugin to your package.json's devDependencies and to the plugins array
in your `serverless.yml` file

Terminal:
```
npm install --save-dev serverless-aws-alias
```

serverless.yml:
```
plugins:
  - serverless-aws-alias
```

After installation the plugin will automatically hook into the deployment process. Additionally the new `alias` command is added to Serverless which offers some functionality for aliases.

## Deploy the default alias

The default alias (for the stage) is deployed just by doing a standard stage
deployment with `serverless deploy`. By default the alias is set to the stage
name. Optionally you can set the name of the default (master) alias using the
option `--masterAlias`, e.g., `serverless deploy --masterAlias`. (If you have
already created a serverless deployment without manually setting the default
alias, this option should not be used.)
From now on you can reference the aliased versions on Lambda invokes with the
stage qualifier. The aliased version is read only in the AWS console, so it is
guaranteed that the environment and function parameters (memory, etc.) cannot
be changed for a deployed version by accident, as it can be done with the
`$LATEST` qualifier.This adds an additional level of stability to your deployment
process.

## Deploy a single function

The plugin supports `serverless deploy function` and moves the alias to the
updated function version. However you must specify the `--force` switch on the
commandline to enforce Serverless to deploy a new function ZIP regardless, if the
code has changed or not. This is necessary to prevent setting the alias to a
version of the function that has been deployed by another developer.

## Deploy an alias

To deploy an alias to a stage, just add the `--alias` option to `serverless deploy`
with the alias name as option value.

Example:
`serverless deploy --alias myAlias`

## Remove an alias

See the `alias remove` command below.

## Maintain versions

By default, when you deploy, the version of the function gets assigned the retention policy of 'Delete'. This means any subsequent deploys will delete any version without an alias. This was done because each lambda version has its own stack. That stack can contain differences in not only the function code, but resources and events. When an alias is removed from a version and the version of the lambda is not deleted, it is no longer possible to tell which stack it came from and which resources/events it was meant to work with. Therefore versions without aliases will get deleted on subsequent deploys.

There are usecases where retaining versions is less risky and as such, you can opt into retaining these versions by deploying with the `--retain` flag.

## Remove a service

To remove a complete service, all deployed user aliases have to be removed first,
using the `alias remove` command.

To finally remove the whole service (same outcome as `serverless remove`), you have
to remove the master (stage) alias with `serverless alias remove --alias=MY_STAGE_NAME`.

This will trigger a removal of the master alias CF stack followed by a removal of
the service stack. After the stacks have been removed, there should be no remains
of the service.

The plugin will print reasonable error messages if you miss something so that you're
guided through the removal.

## Aliases and API Gateway

In Serverless stages are, as above mentioned, parallel stacks with parallel resources.
Mapping the API Gateway resources to this semantics, each stage has its own API
deployment.

Aliases fit into this very well and exactly as with functions an alias is a kind
of "tag" within the API deployment of one stage. Curiously AWS named this "stage"
in API Gateway, so it is not to be confused with Serverless stages.

Thus an alias deployment will create an API Gateway stage with the alias name
as name.

### API Gateway stage and deployment

The created API Gateway stage has the stage variables SERVERLESS_STAGE and
SERVERLESS_ALIAS set to the corresponding values.

If you want to test your APIG endpoints in the AWS ApiGateway console, you have
to set the SERVERLESS_ALIAS stage variable to the alias that will be used for the
Lambda invocation. This will call the aliased function version.

Deployed stages have the alias stage variable set fixed, so a deployed alias stage is
hard-wired to the aliased Lambda versions.

### Stage configuration (NEW)

The alias plugin supports configuring the deployed API Gateway stages, exactly as
you can do it within the AWS APIG console, e.g. you can configure logging (with
or without data/request tracing), setup caching or throttling on your endpoints.

The configuration can be done on a service wide level, function level or method level
by adding an `aliasStage` object either to `provider`, `any function` or a `http event`
within a function in your _serverless.yml_. The configuration is applied hierarchically,
where the inner configurations overwrite the outer ones.

`HTTP Event -> FUNCTION -> SERVICE`

#### API logs

The generated API logs (in case you enable logging with the `loggingLevel` property)
can be shown the same way as the function logs. The plugin adds the `serverless logs api`
command which will show the logs for the service's API. To show logs for a specific
deployed alias you can combine it with the `--alias` option as usual.

#### The aliasStage configuration object

All settings are optional, and if not specified will be set to the AWS stage defaults.

```
aliasStage:
  cacheDataEncrypted: (Boolean)
  cacheTtlInSeconds: (Integer)
  cachingEnabled: (Boolean)
  dataTraceEnabled: (Boolean) - Log full request/response bodies
  loggingLevel: ("OFF", "INFO" or "ERROR")
  metricsEnabled: (Boolean) - Enable detailed CW metrics
  throttlingBurstLimit: (Integer)
  throttlingRateLimit: (Number)
```

There are two further options that can only be specified on a service level and that
affect the whole stage:

```
aliasStage:
  cacheClusterEnabled: (Boolean)
  cacheClusterSize: (Integer)
```

For more information see the [AWS::APIGateway::Stage](http://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/aws-resource-apigateway-stage.html) or [MethodSettings](http://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/aws-properties-apitgateway-stage-methodsetting.html) documentation
on the AWS website.

Sample serverless.yml (partial):

```
service: sls-test-project

provider:
  ...
  # Enable detailed error logging on all endpoints
  aliasStage:
    loggingLevel: "ERROR"
    dataTraceEnabled: true
  ...

functions:
  myFunc1:
    ...
    # myFunc1 should generally not log anything
    aliasStage:
      loggingLevel: "OFF"
      dataTraceEnabled: false
    events:
      - http:
          method: GET
          path: /func1
      - http:
          method: POST
          path: /func1/create
      - http:
          method: PATCH
          path: /func1/update
          # The update endpoint needs special settings
          aliasStage:
            loggingLevel: "INFO"
            dataTraceEnabled: true
            throttlingBurstLimit: 200
            throttlingRateLimit: 100

  myFunc2:
    ...
    # Will inherit the global settings if nothing is set on function level
```

## Reference the current alias in your service

You can reference the currently deployed alias with `${self:provider.alias}` in
your service YAML file. It should only be used for information, but not to
set any resource names. Making anything hard-wired to the alias name might
make the project unusable when deployed to different aliases because the resources
are maintained in the master CF stack - the plugin takes care that resources
are available.

A valid use is to forward the alias name as environment variable to the lambdas
and use it there for tagging of log messages. Then you see immediately which
aliased lambda is the origin.

Any other use with the further exception of lambda event subscriptions (see below)
is strongly discouraged.

## Resources

Resources are deployed per alias. So you can create new resources without destroying
the main alias for the stage. If you remove an alias the referenced resources will
be removed too.

However, logical resource ids are unique per stage. If you deploy a resource into
one alias, it cannot be deployed with the same logical resource id and a different
configuration into a different alias. Nevertheless, you can have the same resource
defined within multiple aliases with the same configuration.

This behavior exactly resembles the workflow of multiple developers working on
different VCS branches.

The master alias for the stage has a slightly different behavior. If you deploy
here, you are allowed to change the configuration of the resource (e.g. the
capacities of a DynamoDB table). This deployment will reconfigure the resource
and on the next alias deployment of other developers, they will get an error
that they have to update their configuration too - most likely, they updated it
already, because normally you rebase or merge your upstream and get the changes
automatically.

## Event subscriptions

Event subscriptions that are defined for a lambda function will be deployed per
alias, i.e. the event will trigger the correct deployed aliased function.

### SNS

Subscriptions to SNS topics can be implicitly defined by adding an `sns` event to
any existing lambda function definition. Serverless will create the topic for you
and add a subscription to the deployed function.

With the alias plugin the subscription will be per alias. Additionally the created
topic is renamed and the alias name is added (e.g. myTopic-myAlias). This is done
because SNS topics are independent per stage. Imagine you want to introduce a new
topic or change the data/payload format of an existing one. Just attaching different
aliases to one central topic would eventually break the system, as functions from
different stages will receive the new data format. The topic-per-alias approach
effectively solves the problem.

If you want to refer to the topic programmatically, you just can add `-${process.env.SERVERLESS_ALIAS}`
to the base topic name.

### Use with global resources

Event subscriptions can reference resources that are available throughout all
aliases if they reference the same resource id. That means that an event will
trigger all aliases that are deployed with the subscription defined.

Example:

```
functions:
  testfct1:
    description: 'My test function'
    handler: handlers/testfct1/handler.handle
    events:
      - stream:
          type: kinesis
          arn: "arn:aws:kinesis:${self:provider.region}:XXXXXX:stream/my-kinesis"
      - http:
          method: GET
          path: /func1
resources:
  Resources:
    myKinesis:
      Type: AWS::Kinesis::Stream
      Properties:
        Name: my-kinesis
        ShardCount: 1
```

When a function is deployed to an alias it will now also listen to the *my-kinesis*
stream events. This is useful, if you want to test new implementations with an
existing resource.

### Use with per alias resources

**Currently this feature is not available. The Serverless framework does not
support variable substitution in property names (see [#49][link-49]).
As soon as this has been implemented there, this note will be removed.**

There might be cases where you want to test with your private resources first,
before you deploy changes to the master alias. Or you just want to create separate
resources and event subscriptions per alias.

The solution here is to make the resource id dependent on the alias name, so that
the alias effectively owns the resource and the event subscription is bound to it.

Example:

```
functions:
  testfct1:
    description: 'My test function'
    handler: handlers/testfct1/handler.handle
    events:
      - stream:
          type: kinesis
          arn: "arn:aws:kinesis:${self:provider.region}:XXXXXX:stream/my-kinesis-${self.provider.alias}"
      - http:
          method: GET
          path: /func1
resources:
  Resources:
    myKinesis${self:provider.alias}:
      Type: AWS::Kinesis::Stream
      Properties:
        Name: my-kinesis-${self.provider.alias}
        ShardCount: 1
```

### Named streams

The examples above use named streams. I know that this is not perfect as changes
that require replacement are not possible. The reason for the named resources is,
that Serverless currently only supports event arns that are strings.
The change is already in the pipeline there. Afterwards you just can reference
the event arns with CF functions like "Fn::GetAtt" or "Ref". I will update
the examples as soon as it is fixed there and publicly available.

## Serverless info integration

The plugin integrates with the Serverless info command. It will extend the information
that is printed with the list of deployed aliases.

In verbose mode (`serverless info -v`) it will additionally print the names
of the lambda functions deployed to each stage with the version numbers the
alias points to.

Given an alias with `--alias=XXXX` info will show information for the alias.

## Serverless logs integration

The plugin integrates with the Serverless logs command (all standard options will
work). Additionally, given an alias with `--alias=XXXX`, logs will show the logs
for the selected alias. Without the alias option it will show the master alias
(aka. stage alias).

The generated API logs (in case you enable logging with the stage `loggingLevel` property)
can be shown the same way as the function logs. The plugin adds the `serverless logs api`
command which will show the logs for the service's API. To show logs for a specific
deployed alias you can combine it with the `--alias` option as usual.

## The alias command

## Subcommands
### alias remove

Removes an alias and all its uniquely referenced functions and function versions.
The alias name has to be specified with the `--alias` option.

Functions and resources owned by removed aliases will be physically removed after
the alias stack has been removed.

## Compatibility

The alias plugin is compatible with all standard Serverless commands and switches.
For example, you can use `--noDeploy` and the plugin will behave accordingly.

## Interoperability

Care has to be taken when using other plugins that modify the CF output too.
I will add configuration instructions in this section for these plugin combinations.

### [serverless-plugin-warmup](https://github.com/FidelLimited/serverless-plugin-warmup)

The warmup plugin will keep your Lambdas warm and reduce the cold start time
effectively. When using the plugin, it must be listed **before** the alias plugin
in the plugin list of _serverless.yml_. The warmup lambda created by the plugin
will be aliased too, so that the warmup plugin can be configured differently
per deployed alias.

## Test it

In case you wanna test how it behaves, I provided a predefined test service in
the `sample` folder, that creates two functions and a DynamoDB table.
Feel free to check everything - and of course report bugs immediately ;-)
as I could not test each and every combination of resources, functions, etc.

## Use case examples

### Multiple developers work on different branches

A common use case is that multiple developers work on different branches on the same
service, e.g. they add new functions individually. Every developer can just
deploy his version of the service to different aliases and use them. Neither
the main (stage) alias is affected by them nor the other developers.

If work is ceased on a branch and it is deleted, the alias can just be removed
and on the next deployment of any other alias, the obsoleted functions will
disappear automatically.

### Sample project

A preconfigured sample project can be found [here](https://github.com/HyperBrain/serverless-aws-alias-example).
It lets you start testing right away. See the project's README for instructions.
The sample project will evolve over time - when new features or changes are
integrated into the plugin.

## Uninstall

If you are not happy with the plugin or just do not like me, you can easily get rid
of the plugin without doing any harm to the deployed stuff. The plugin is
non-intrusive and does only add some output variables to the main stack:

* Remove all alias stacks via the CloudFormation console or with 'alias remove'
* Remove the plugin from your serverless.yml and your package.json
* Deploy the service again (serverless deploy)

You're all set.

## Advanced use cases

### VPC settings

Aliases can have different VPC settings (serverless.yml:provider.vpc). So you
can use an alias deployment also for testing lambda functions within other
internal networks. This is possible because each deployed AWS lambda version
contains its entire configuration (VPC settings, environment, etc.)

## For developers
### Lifecycle events

_currently the exposed hooks are not available after the change to the new SLS lifecycle model_

The plugin adds the following lifecycle events that can be hooked by other plugins:

* alias:deploy:uploadArtifacts

  Upload alias dependent CF definitions to S3.

* alias:deploy:updateAliasStack

  Update the alias CF stack.

* alias:deploy:done

  The Alias plugin is successfully finished. Hook this instead of 'after:deploy:deploy'
  to make sure that your plugin gets triggered right after the alias plugin is done.

* alias:remove:removeStack

  The alias stack is removed from CF.

### CF template information (not yet implemented)

If you hook after the alias:deploy:loadTemplates hook, you have access to the
currently deployed CloudFormation templates which are stored within the global
Serverless object: _serverless.service.provider.deployedCloudFormationTemplate_
and _serverless.service.provider.deployedAliasTemplates[]_.

## Ideas

* The master alias for a stage could be protected by a separate stack policy that
  only allows admin users to deploy or change it. The stage stack does not have
  to be protected individually because the stack cross references prohibit changes
  naturally. It might be possible to introduce some kind of per alias policy.

## Version history

* 1.8.0
  * Option to retain lambda function versions [#160][link-160]
  * **Breaking** drop Node.js 6 support [#161][link-161]

* 1.7.2
  * Added support for Lambda custom roles [#87][link-87] [#88][link-88]
  * Added support for dash in alias name when creating api gateway authorizers [#140][link-140]
  * Configurable master alias [#127][link-127]
  * Fix for "functionnames" where "functionname" A starts with function name B [#159][link-159]
  * Dependencies updated

* 1.7.1
  * Restore compatibility with Serverless 1.27 [#120][link-120]

* 1.7.0
  * Support existing custom authorizers [#101][link-101]
  * Support domain-manager plugin [#110][link-110]
  * Support pseudo-parameter plugin [#112][link-112]
  * Show logs from arbitrary versions [#62][link-62], [#89][link-89]

* 1.6.1
 * Fixed custom authorizer references [#102][link-102]
 * Fixed broken DynamoDB stream deployments [#85][link-85]
 * Security: Updated moment

* 1.6.0
 * Fixed issue with request authorizers [#96][link-96]
 * Support subscription to existing SNS topic [#94][link-94]

* 1.5.1
  * Support prewarmup with the warmup plugin [#72][link-72]
  * Support `_ - +` in alias names [#68][link-68]
  * Support ANY method type with stage configuration [#80][link-80]

* 1.5.0
  * Support `serverless deploy function` [#29][link-29]

* 1.4.1
  * Fixed crash when using logs --tail

* 1.4.0
  * Add support for S3 server side encryption [#63][link-63]
  * Add `serverless logs api` command to watch API logs [#60][link-60]

* 1.3.0
  * Support full stage configuration at multiple levels [#57][link-57]
  * Fix issue when trying to remove a stage completely [#56][link-56]

* 1.2.1
  * Fix issue when using a Cognito User Pools authorizer [#51][link-51]
  * IAM roles of removed aliases are not deleted [#50][link-50]
  * Added note to README to state that per-alias resources do not work until fixed/added in Serverless

* 1.2.0
  * Fix issue when stage is specified as Serverless variable [#45][link-45]
  * Add support for SNS Lambda subscriptions [#43][link-43]
  * Add support for custom authorizers [#22][link-22]

* 1.1.0
  * Use stage variable in APIG [#40][link-40]
  * Fix tail logging [#42][link-42]

* 1.0.0 Support "serverless logs" with aliases. First non-alpha!

[ico-serverless]: http://public.serverless.com/badges/v3.svg
[ico-license]: https://img.shields.io/github/license/serverless-heaven/serverless-webpack.svg
[ico-npm]: https://img.shields.io/npm/v/serverless-aws-alias.svg
[ico-build]: https://travis-ci.org/serverless-heaven/serverless-aws-alias.svg?branch=master
[ico-coverage]: https://coveralls.io/repos/github/serverless-heaven/serverless-aws-alias/badge.svg?branch=master
[ico-contributors]: https://img.shields.io/github/contributors/serverless-heaven/serverless-aws-alias.svg
[ico-npm-downloads]: https://img.shields.io/npm/dt/serverless-aws-alias.svg

[link-serverless]: http://www.serverless.com/
[link-license]: ./blob/master/LICENSE
[link-npm]: https://www.npmjs.com/package/serverless-aws-alias
[link-build]: https://travis-ci.org/serverless-heaven/serverless-aws-alias
[link-coverage]: https://coveralls.io/github/serverless-heaven/serverless-aws-alias?branch=master
[link-contributors]: https://github.com/serverless-heaven/serverless-aws-alias/graphs/contributors

[comment]: # (Referenced issues)

[link-22]: https://github.com/serverless-heaven/serverless-aws-alias/issues/22
[link-29]: https://github.com/serverless-heaven/serverless-aws-alias/issues/29
[link-40]: https://github.com/serverless-heaven/serverless-aws-alias/issues/40
[link-42]: https://github.com/serverless-heaven/serverless-aws-alias/issues/42
[link-43]: https://github.com/serverless-heaven/serverless-aws-alias/issues/43
[link-45]: https://github.com/serverless-heaven/serverless-aws-alias/issues/45
[link-49]: https://github.com/serverless-heaven/serverless-aws-alias/issues/49
[link-50]: https://github.com/serverless-heaven/serverless-aws-alias/issues/50
[link-51]: https://github.com/serverless-heaven/serverless-aws-alias/issues/51
[link-56]: https://github.com/serverless-heaven/serverless-aws-alias/issues/56
[link-57]: https://github.com/serverless-heaven/serverless-aws-alias/issues/57
[link-60]: https://github.com/serverless-heaven/serverless-aws-alias/issues/60
[link-62]: https://github.com/serverless-heaven/serverless-aws-alias/issues/62
[link-63]: https://github.com/serverless-heaven/serverless-aws-alias/issues/63
[link-68]: https://github.com/serverless-heaven/serverless-aws-alias/issues/68
[link-72]: https://github.com/serverless-heaven/serverless-aws-alias/issues/72
[link-80]: https://github.com/serverless-heaven/serverless-aws-alias/issues/80
[link-85]: https://github.com/serverless-heaven/serverless-aws-alias/issues/85
[link-87]: https://github.com/serverless-heaven/serverless-aws-alias/issues/87
[link-88]: https://github.com/serverless-heaven/serverless-aws-alias/issues/88
[link-89]: https://github.com/serverless-heaven/serverless-aws-alias/issues/89
[link-94]: https://github.com/serverless-heaven/serverless-aws-alias/issues/94
[link-96]: https://github.com/serverless-heaven/serverless-aws-alias/issues/96
[link-101]: https://github.com/serverless-heaven/serverless-aws-alias/issues/101
[link-102]: https://github.com/serverless-heaven/serverless-aws-alias/issues/102
[link-110]: https://github.com/serverless-heaven/serverless-aws-alias/issues/110
[link-112]: https://github.com/serverless-heaven/serverless-aws-alias/issues/112
[link-120]: https://github.com/serverless-heaven/serverless-aws-alias/issues/120
[link-127]: https://github.com/serverless-heaven/serverless-aws-alias/issues/127
[link-140]: https://github.com/serverless-heaven/serverless-aws-alias/issues/140
[link-159]: https://github.com/serverless-heaven/serverless-aws-alias/issues/159
[link-160]: https://github.com/serverless-heaven/serverless-aws-alias/issues/122
[link-161]: https://github.com/serverless-heaven/serverless-aws-alias/pull/173
