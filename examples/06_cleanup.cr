# The unused body is not type-checked; Cleanup removes the constant branch.
def unused(x)
  x.this_method_does_not_exist
end

if false
  0
else
  1
end
