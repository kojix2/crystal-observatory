# Compare CleanupTransformer after semantic analysis with the final IR.
def unused(x)
  x.this_method_does_not_exist
end

if false
  99
else
  42
end
