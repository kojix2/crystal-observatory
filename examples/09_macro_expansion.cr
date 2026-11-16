# Compare this call with the expanded AST: 3 * 3.
macro square(x)
  {{x}} * {{x}}
end

square(3)
