# Registration coverage: hierarchy, overloads, include/extend and macro origins.
module Named
  def label
    "instance"
  end
end

module FactoryLabel
  def label
    "class"
  end
end

class Parent
end

class Child < Parent
  include Named
  extend FactoryLabel

  def value(x : Int32)
    x
  end

  def self.value(x : Int32)
    x
  end
end

class Child
  def value(x : String)
    x
  end
end

macro make_type(name)
  class {{name.id}}
    def value
      42
    end
  end
end

make_type Generated

puts Child.new.label
puts Child.label
puts Child.new.value(7)
puts Child.value(8)
puts Child.new.value("nine")
puts Generated.new.value
