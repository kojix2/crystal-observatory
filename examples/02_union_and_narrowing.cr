# The branches produce Int32 | String; is_a? narrows it inside each branch.
value = ARGV.empty? ? 1 : "a"

if value.is_a?(Int32)
  value + 1
else
  value.size
end
