# Observe how +=, unless, and until are transformed.
x = 1
x += 2
unless x > 10
  x = x + 4
end
until x >= 12
  x += 1
end
x
