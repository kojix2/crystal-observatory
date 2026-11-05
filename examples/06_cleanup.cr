# 意味解析後のCleanupTransformerと最終IRを比較。
def unused(x)
  x.this_method_does_not_exist
end

if false
  99
else
  42
end
