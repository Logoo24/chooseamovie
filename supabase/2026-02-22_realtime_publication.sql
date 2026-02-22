do $$
begin
  begin
    execute 'alter publication supabase_realtime add table public.members';
  exception
    when duplicate_object then null;
  end;

  begin
    execute 'alter publication supabase_realtime add table public.ratings';
  exception
    when duplicate_object then null;
  end;

  begin
    execute 'alter publication supabase_realtime add table public.group_top_titles';
  exception
    when duplicate_object then null;
  end;
end;
$$;
