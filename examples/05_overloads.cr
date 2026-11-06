# Each call selects a different Def; compare this with example 01.
def scale(x : Int32)
  x * 2
end

def scale(x : Float64)
  x * 2
end

scale(1)
scale(1.0)
