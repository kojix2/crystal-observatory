# The branches produce Int32 | String; is_a? narrows it inside each branch.
value = true ? 1 : "a"

if value.is_a?(Int32)
  value
else
  value
end
