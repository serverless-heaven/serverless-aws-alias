# Serverless AWS alias plugin

BETA: This project is currently in beta. It has been tested with many, but not
all constellations that are possible within a Serverless service. The plugin
is currently tested with Serverless 1.6.1. It is important that you try that
version and the newest one.

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

## Log groups (not yet finished)

Each alias has its own log group. From my experience with Serverless 0.5 where
all aliased versions put their logs into the same group, this should be much
cleaner and the removal of an alias will also remove all logs associated to the alias.
The log group is named `/serverless/<alias stack name>`. So you can clearly see
what is deployed through Serverless and what by other means.

## Resources (not yet finished)

Resources are deployed per alias. So you can create new resources without destroying
the main alias for the stage. If you remove an alias the referenced resources will
be removed too.

*BEWARE: Currently the custom resources per alias must not be different. As soon
as the resource handling is implemented, the custom resources will behave exactly
like the SLS resources and can be different per alias!*

## The alias command

Without specifying a subcommand the alias command will list all currently deployed
aliases.

Example:
`serverless alias`

## Subcommands
### alias remove

Removes an alias and all its uniquely references functions and function versions.
The alias name has to be specified with the `--alias` option.

Functions and resources owned by removed aliases will be physically removed on
the next deployment of any other alias. This is on purpose to keep CloudFormation
API access at a minimum.

## Compatibility

The alias plugin is compatible with all standard Serverless commands and switches.
For example, you can use `--noDeploy` and the plugin will behave accordingly.

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

## Uninstall

If you are not happy with the plugin or just do not like me, you can easily get rid
of the plugin without doing any harm to the deployed stuff. The plugin is
non-intrusive and does only add some output variables to the main stack:

* Remove all alias stacks via the CloudFormation console or with 'alias remove'
* Remove the plugin from your serverless.yml and your package.json
* Deploy the service again (serverless deploy)

You're all set.

## For developers
### Lifecycle events

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

### CF template information

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

* 0.1.1-alpha1 Full APIG support
* 0.1.0-alpha1 Lambda function alias support
