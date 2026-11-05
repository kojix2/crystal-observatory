macro repeated(enabled)
  {% if enabled %}
    {% for value, index in [2, 4, 6] %}
      puts {{value}} + {{index}}
    {% end %}
  {% else %}
    puts 0
  {% end %}
end

repeated(true)
