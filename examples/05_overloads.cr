# Different argument types select different definitions of the same method.
def scale(x : Int32)
  x * 2
end

def scale(x : Float64)
  x * 0.5
end

a = scale(21)
b = scale(3.0)
{a, b}
