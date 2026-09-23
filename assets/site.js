const search = document.querySelector('#post-search');
if (search) {
  const rows = [...document.querySelectorAll('.archive-row')];
  const groups = [...document.querySelectorAll('.year-group')];
  const empty = document.querySelector('#search-empty');
  search.addEventListener('input', () => {
    const query = search.value.trim().toLocaleLowerCase();
    let visible = 0;
    rows.forEach(row => {
      const matches = row.dataset.search.includes(query);
      row.hidden = !matches;
      if (matches) visible++;
    });
    groups.forEach(group => {
      group.hidden = !group.querySelector('.archive-row:not([hidden])');
    });
    empty.hidden = visible > 0 || query === '';
  });
}
