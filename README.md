[![Build Status](https://travis-ci.org/HyperBrain/serverless-aws-alias.svg?branch=master)](https://travis-ci.org/HyperBrain/serverless-aws-alias)
[![Coverage Status](https://coveralls.io/repos/github/HyperBrain/serverless-aws-alias/badge.svg?branch=master)](https://coveralls.io/github/HyperBrain/serverless-aws-alias?branch=master)
[![npm version](https://badge.fury.io/js/serverless-aws-alias.svg)](https://badge.fury.io/js/serverless-aws-alias)

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
in your `serverless.yml` file. After installation the plugin will automatically
hook into the deployment process.
Additionally the new `alias` command is added to Serverless which offers some
functionality for aliases.

## Deploy the default alias

The default alias (for the stage) is deployed just by doing a standard stage
deployment with `serverless deploy`. From now on you can reference the aliased
versions on Lambda invokes with the stage qualifier. The aliased version is
read only in the AWS console, so it is guaranteed that the environment and
function parameters (memory, etc.) cannot be changed for a deployed version
by accident, as it can be done with the `$LATEST` qualifier.
This adds an additional level of stability to your deployment process.

## Deploy an alias

To deploy an alias to a stage, just add the `--alias` option to `serverless deploy`
with the alias name as option value.

Example:
`serverless deploy --alias myAlias`

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

Upcoming: There will be a configuration possibility to configure the APIG
stage parameters separately soon.

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

_currently the exposed hooks are disabled after the change to the new SLS lifecycle model_

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

* 1.0.0        Support "serverless logs" with aliases. First non-alpha!
* 0.5.1-alpha1 Use separate Lambda roles per alias
* 0.5.0-alpha1 Fixes a bug with deploying event sources introduced with 0.4.0
               Use new event model introduced in SLS 1.12. Needs SLS 1.12 or greater from now on.
							 Add support for CW events.
							 Set SERVERLESS_ALIAS environment variable on deployed functions.
* 0.4.0-alpha1 APIG support fixed. Support external IAM roles. BREAKING.
* 0.3.4-alpha1 Bugfixes. IAM policy consolitaion. Show master alias information.
* 0.3.3-alpha1 Bugfixes. Allow manual resource overrides. Allow methods attached to APIG root resource.
* 0.3.2-alpha1 Allow initial project creation with activated alias plugin
* 0.3.1-alpha1 Support Serverless 1.6 again with upgrade to 1.7+
* 0.3.0-alpha1 Support lambda event subscriptions
* 0.2.1-alpha1 Alias remove command removes unused resources
* 0.2.0-alpha1 Support custom resources
* 0.1.2-alpha1 Integration with "serverless info"
* 0.1.1-alpha1 Full APIG support
* 0.1.0-alpha1 Lambda function alias support
