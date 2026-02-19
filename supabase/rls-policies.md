group_custom_list

Disable RLS

Create policy

Name	Command	Applied to	Actions

group_custom_list_delete_owner_only
DELETE	
authenticated, anonymous sign-ins


group_custom_list_select_owner_or_member
SELECT	
public, anonymous sign-ins


group_custom_list_update_owner_only
UPDATE	
authenticated, anonymous sign-ins


group_custom_list_write_owner_only
INSERT	
authenticated, anonymous sign-ins

group_top_titles

Disable RLS

Create policy

Name	Command	Applied to	Actions

group_top_titles_select_owner_or_member
SELECT	
public, anonymous sign-ins

groups

Disable RLS

Create policy

Name	Command	Applied to	Actions

groups_insert_authenticated
INSERT	
authenticated, anonymous sign-ins


groups_select_owner_or_member
SELECT	
public, anonymous sign-ins


groups_update_owner
UPDATE	
authenticated, anonymous sign-ins

members

Disable RLS

Create policy

Name	Command	Applied to	Actions

members_insert_self
INSERT	
authenticated, anonymous sign-ins


members_select_group_members
SELECT	
public, anonymous sign-ins


members_select_owner_or_self
SELECT	
authenticated, anonymous sign-ins


members_update_self
UPDATE	
authenticated, anonymous sign-ins

ratings

Disable RLS

Create policy

Name	Command	Applied to	Actions

ratings_insert_self
INSERT	
public, anonymous sign-ins


ratings_select_owner_or_group_member
SELECT	
public, anonymous sign-ins


ratings_update_self
UPDATE	
public, anonymous sign-ins

title_cache

Disable RLS

Create policy

Name	Command	Applied to	Actions

title_cache_read_all
SELECT	
public, anonymous sign-ins


title_cache_update_authed
UPDATE	
public, anonymous sign-ins


title_cache_write_authed
INSERT	
public, anonymous sign-ins

