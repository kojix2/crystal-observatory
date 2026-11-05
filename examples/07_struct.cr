# Observe the type declaration, initialize, generated new method, and specialization.
struct Point
  getter x : Int32
  getter y : Int32

  def initialize(@x, @y)
  end

  def sum
    @x + @y
  end
end

Point.new(12, 30).sum
