const entry = (ja, en, es, zh, fr, de, ru) => ({ ja, en, es, 'zh-CN': zh, fr, de, ru });

export const comparisonMessages = {
  'comparison.title': entry(
    'ビューを比較',
    'Compare views',
    'Comparar vistas',
    '比较视图',
    'Comparer les vues',
    'Ansichten vergleichen',
    'Сравнить представления',
  ),
  'comparison.open': entry(
    '比較…',
    'Compare…',
    'Comparar…',
    '比较…',
    'Comparer…',
    'Vergleichen…',
    'Сравнить…',
  ),
  'comparison.close': entry(
    '比較を終了',
    'End comparison',
    'Finalizar comparación',
    '结束比较',
    'Terminer la comparaison',
    'Vergleich beenden',
    'Завершить сравнение',
  ),
  'comparison.divider': entry(
    '比較ビューの幅を調整',
    'Comparison view divider',
    'Separador de comparación',
    '比较视图分隔线',
    'Séparateur des vues comparées',
    'Trenner der Vergleichsansichten',
    'Разделитель сравниваемых представлений',
  ),
  'comparison.sourceStale': entry(
    'ソースは編集中です。AST・IRは前回解析時の結果です。',
    'Source has edits. AST and IR show the last analysis.',
    'El código tiene cambios. AST e IR muestran el último análisis.',
    '源码已修改，AST 和 IR 显示的是上次分析结果。',
    'Le code a été modifié. L’AST et l’IR montrent la dernière analyse.',
    'Quelltext geändert. AST und IR zeigen die letzte Analyse.',
    'Исходный код изменён. AST и IR показывают последний анализ.',
  ),
};
