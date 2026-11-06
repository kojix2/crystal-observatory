# Follow type creation, inheritance, include/extend and reopening.
module Named
  def value
    1
  end
end

class Parent
end

class Child < Parent
  include Named
  extend Named
end

class Child
  def value
    2
  end
end

Child.new.value
Child.value
