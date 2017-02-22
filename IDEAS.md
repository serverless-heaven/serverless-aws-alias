Alias plugin ideas
==================

configuration
-------------
* Support for alias independent resources and references.
* Support for alias based log streams or (as in 0.5) service based log streams.
* Allow functions to be tagged as "instance per alias", for functions that should be deployed
  as different functions for each alias. Examples are functions that are references from other
  AWS services that do not allow refereincing aliases. Optimally the system should change the 
  physical stack layout accordingly if this property is changed and keep the deployment history.


deploy
------
Deploy without a default stage will only create the stage independent stack containing
the empty function definitions, log streams and the (new) stage independent resources.
The default alias name is the stage name. That ensures the system also works in case someone
does not deploy aliases at all.

deploy stage
------------
Deploys/updates a stage stack (and the service stack if not already deployed). If a new stage name
is given, the stage will be implicitly created (including the stage dependent resources).

If a stage is deployed to a different region there are multiple ways to handle this:
* Completely independent
  A region could be seen as completely independent environment, i.e. the service stack will be deployed
  to the region too.
* As service stage only
  Only the stage stack will be deployed to the other region and the current service stack region
  would be the "home" of the service. If the service is removed, it will also remove the deployed stage
  in all other regions (the deployed stage in the other region will reference the service stack in the
  home region).
  
 Personally I'd prefer the "service stage only" approach - the independent approach could be used for 
 cross account deployments.

rollback stage
--------------
Rollback a stage to the previously deployed version

reset stage
-----------
Kind of like the "git reset" command. This should allow you to reset a stage version to the same
version as another stage. Would be great for developers that work on their own stages and want to
start with a fresh deployment.

remove stage
------------
Stage removal can be done by just deleting the stage dependent stack. All aliases and possibly
orphaned function versions should be removed automatically.

clone stage
-----------
With stage dependent stacks it should be quite easy to provide a _close stage_ functionality
that will clone an existing stage and set the aliases automatically to the same versions of the
origin stage.


Open
----
Review technical documentation how to apply the same semantics to APIG (staged deployment via CF).


Implementation specification
----------------------------
