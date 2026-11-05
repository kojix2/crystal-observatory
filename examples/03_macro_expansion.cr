# Macro本体と、展開で生まれたASTを見比べる。
macro square(x)
  {{x}} * {{x}}
end

n = 7
square(n)
