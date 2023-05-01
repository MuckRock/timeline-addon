/* global findDates, _, d3 */

//const searchURL =
//'https://api.www.documentcloud.org/api/documents/search?q=*:*&order_by=created_at';
var defaultFetchOpts = { credentials: 'include', mode: 'cors' };

// Constants
const yearHeight = 64;
const dayHeight = 64;
const maxBarLength = 200;
const monthTimelineHeight = 31 * dayHeight;
const monthHeaderHeight = 80;
const minReasonableDate = new Date(1000, 0, 0);
const maxRenderFPS = 2;
const defaultProjectId = '211714'; // This one is really huge (20K+ docs): '210820';
const selfURL = 'https://api.www.documentcloud.org/api/users/me/';

// State. TODO: Encapsulate.
var occsByDateStringByMonthByYear;
// Structure:
// { year: { month: { dateString: [ occurrences ] }}}
// TypeScript def would be: Record<string, Record<string, Record<string, Occurrence[]>>>
var counts;
var mostOccsInAYear;
var currentYear;
var yearsUsedInDocs;
var entityCount;
var docsWithoutDatesCount;
var docsWithDatesCount;

var throttledUseOccs = _.throttle(useOccs, 1000 / maxRenderFPS);
var throttledRenderDocCounts = _.throttle(renderDocCounts, 1000 / 10);

// Scales
var yearWidthScale = d3
  .scaleLinear()
  .domain([0, mostOccsInAYear])
  .range([0, maxBarLength]);

// Selections
var docContainerSel = d3.select('.doc-container');
var docFrameSel = d3.select('#doc-frame');
var yearMapContainerSel = d3.select('.year-map-container');
var yearMapToggleSel = d3.select('#year-map-toggle-button');
var docCloseSel = d3.select('#doc-close-button');
var projectUpdateButtonSel = d3.select('#change-project-button');
var projectInput = d3.select('#project-input');
var projectSelect = d3.select('#project-select');
var monthContainer = d3.select('.month-map');
var statusMessageSel = d3.select('#status-message');
var dateDocCountSel = d3.select('#date-doc-count');
var noDateDocCountSel = d3.select('#no-date-doc-count');
var yearLabelSel = d3.select('#current-year-label');

// Handlers
yearMapToggleSel.on('click', onYearMapToggleClick);
docCloseSel.on('click', onDocCloseClick);
projectUpdateButtonSel.on('click', onUpdateProjectClick);

(function init() {
  let hashParts = window.location.hash.split('=');
  let projectId = hashParts.length > 1 ? hashParts[1] : undefined;
  runWithProject(projectId);
  setUpProjectSelect();
})();

function initState() {
  occsByDateStringByMonthByYear = {};
  counts = {
    byYear: {},
    byMonthByYear: {},
    byDateString: {},
  };

  mostOccsInAYear = 0;
  yearsUsedInDocs = [];
  entityCount = 0;
  docsWithoutDatesCount = 0;
  docsWithDatesCount = 0;
}

async function runWithProject(projectId) {
  try {
    initState();
    let errorHappenedWhileFetching = true;
    var nextDocsURL;

    if (!projectId) {
      projectId = defaultProjectId;
    }
    const updatedURL = `${window.location.protocol}//${window.location.host}${window.location.pathname}#project=${projectId}`;
    // Sync URL without triggering onhashchange.
    window.history.pushState(null, null, updatedURL);

    projectInput.node().value = projectId;

    nextDocsURL = `https://api.www.documentcloud.org/api/documents/search/?q=+project:${projectId}&version=2.0`;
    // } else {
    //   nextDocsURL = searchURL;
    // }
    d3.select('.month-map').attr('height', monthTimelineHeight);

    do {
      let res = await fetch(nextDocsURL, defaultFetchOpts);
      if (res.ok) {
        let searchData = await res.json();
        if (searchData.results) {
          let results = searchData.results.map(distillResult);
          // TODO: Queue to limit concurrent requests. For now, just do them in serial and use some self-rate-limiting.
          for (let i = 0; i < results.length; ++i) {
            await collectOccFromDocResult(results[i]);
          }
        }
        if (searchData.next) {
          statusMessageSel.text('Getting more documents…');
          statusMessageSel.classed('hidden', false);
          nextDocsURL = searchData.next;
        } else {
          statusMessageSel.text('Done getting all of your documents!');
          statusMessageSel.classed('hidden', false);
          nextDocsURL = null;
        }
        errorHappenedWhileFetching = false;
      }
    } while (nextDocsURL);

    if (errorHappenedWhileFetching) {
      throw new Error('Error while fetching.');
    }
  } catch (error) {
    handleError(error);
  }
}

function handleError(error) {
  // TODO
  console.error(error);
}

function updateStateWithOcc(occ) {
  if (!occ) {
    return;
  }
  storeOccurrence(occ);
  yearsUsedInDocs = Object.keys(occsByDateStringByMonthByYear);
  if (yearsUsedInDocs.length < 1) {
    throw new Error('No years found in data.');
  }

  throttledUseOccs();

  // Side effect: Updates counts.
  function storeOccurrence(occ) {
    var dateObj;
    try {
      dateObj = new Date(occ.entity.date);
    } catch (error) {
      console.error('Error while putting occ in year dict', error);
      return;
    }
    const year = dateObj.getFullYear();
    if (!counts.byYear[year]) {
      counts.byYear[year] = 0;
    }
    counts.byYear[year] += 1;

    var monthDict = occsByDateStringByMonthByYear[year];
    if (!monthDict) {
      monthDict = {};
      occsByDateStringByMonthByYear[year] = monthDict;
    }

    putInMonthDict(monthDict, dateObj, occ);
    const occsInYear = counts.byYear[year];
    if (occsInYear > mostOccsInAYear) {
      mostOccsInAYear = occsInYear;
      yearWidthScale.domain([0, mostOccsInAYear]);
    }
  }
}

function useOccs() {
  if (!currentYear) {
    currentYear = yearsUsedInDocs[0];
  }
  // Avoid locking up tab.
  requestAnimationFrame(renderChangesToOccs);

  function renderChangesToOccs() {
    renderYearMap(yearsUsedInDocs);
  }
}

function renderDayTimeline({ year, monthIndex, root }) {
  var monthDict = occsByDateStringByMonthByYear[year];
  var dayDict = monthDict ? monthDict[monthIndex] : {};
  var dateStrings = (dayDict ? Object.keys(dayDict) : []).flat().sort();

  var ticks = root
    .select('.timeline-layer')
    .selectAll('.tick')
    .data(dateStrings, getIdForDate);

  ticks.exit().remove();

  var newTicks = ticks.enter().append('g').classed('tick', true);

  newTicks
    .append('line')
    .classed('tick-line', true)
    .attr('x1', 0)
    .attr('x2', 50)
    .attr('y1', 0)
    .attr('y2', 0);
  newTicks
    .append('text')
    .text((dateString) => getLabelForDayTick(monthDict, dateString))
    .attr('x', 54)
    .attr('y', '0.3em');

  newTicks.on('click', onTickClick);

  newTicks
    .merge(ticks)
    .attr('id', getIdForDate)
    .attr('transform', getTransformForTick);

  root
    .select('.doc-lists-layer')
    .selectAll('.date-docs-container')
    .data(dateStrings, (day) => day)
    .enter()
    .append('foreignObject')
    .classed('date-docs-container', true)
    .classed('hidden', true)
    .attr('id', (date) => 'doc-list-' + getIdForDate(date))
    .attr('y', (date) => getYWithinMonthForDate(date) + 8)
    .attr('x', 8)
    .attr('width', 300)
    .attr('height', 320)
    .append('xhtml:div')
    .append('xhtml:ul')
    .selectAll('li')
    .data((day) => getOccsFromMonthDict(monthDict, day))
    .enter()
    .append('li')
    .text((occ) => occ.document.title)
    .on('click', onDocItemClick);
}

function renderYearMap(years) {
  var yearContainer = d3.select('.year-map');

  yearContainer
    .attr('height', years.length * yearHeight)
    .attr('width', maxBarLength);

  var bars = yearContainer
    .select('.timeline-layer')
    .selectAll('.year')
    .data(Object.keys(occsByDateStringByMonthByYear), (x) => x);

  bars.exit().remove();

  var newBars = bars.enter().append('g').classed('year', true);

  newBars.append('rect').classed('bar', true).attr('height', yearHeight);
  newBars
    .append('text')
    .attr('x', 5)
    .attr('y', '1em')
    .classed('year-label', true);
  newBars
    .append('text')
    .attr('x', 5)
    .attr('y', '2em')
    .classed('doc-count', true);

  var existingBars = newBars.merge(bars);
  existingBars
    .select('.bar')
    .attr('width', (year) => yearWidthScale(counts.byYear[year]));
  existingBars.select('.year-label').text((year) => year);
  existingBars
    .select('.doc-count')
    .text((year) => `${counts.byYear[year]} dates in docs`);
  existingBars.attr('transform', getTransformForYear);
  existingBars.on('click', onYearClick);
}

function renderMonthMap(year) {
  var occsByMonth = occsByDateStringByMonthByYear[year];
  var monthWidthScale = d3
    .scaleLinear()
    .domain([0, getMostOccsInAMonth(occsByMonth)])
    .range([0, maxBarLength]);

  var monthsSel = monthContainer.select('.timeline-layer').selectAll('.month');

  monthsSel
    .select('.bar')
    .attr('width', (ignored, month) =>
      monthWidthScale(counts.byMonthByYear[year][month])
    );
  monthsSel
    .select('.doc-count')
    .text((ignored, monthIndex) => getDocCountText(year, monthIndex));

  monthsSel.each(passToRenderDay);

  function passToRenderDay(ignored, monthIndex) {
    renderDayTimeline({ year, monthIndex, root: d3.select(this) });
  }
}

function renderDocCounts() {
  dateDocCountSel.text(docsWithDatesCount);
  noDateDocCountSel.text(docsWithoutDatesCount);
}

function getTransformForTick(dateString) {
  return `translate(0, ${getYWithinMonthForDate(dateString)})`;
}

function getYWithinMonthForDate(dateString) {
  const date = new Date(dateString);
  const startOfMonth = new Date(date.getFullYear(), date.getMonth(), 1);
  const daysFromStartOfMonth =
    (date.getTime() - startOfMonth.getTime()) / (1000 * 60 * 60 * 24);
  return daysFromStartOfMonth * dayHeight + monthHeaderHeight;
}

function getTransformForYear(year, i) {
  const y = i * yearHeight;
  return `translate(0, ${y})`;
}

function getLabelForDayTick(monthDict, dateString) {
  var occsByDateString = getDateStringDictForDateString(monthDict, dateString);
  let occs = occsByDateString[dateString];
  const dateEntityName = occs[0].entity.title;
  return `${dateEntityName} (${occs.length})`;
}

function getOccsFromMonthDict(monthDict, dateString) {
  var dateStringDict = getDateStringDictForDateString(monthDict, dateString);
  if (dateStringDict) {
    return dateStringDict[dateString];
  }
}

function getDateStringDictForDateString(monthDict, dateString) {
  var date = new Date(dateString);
  return monthDict[date.getMonth()];
}

function onDocItemClick(e, occ) {
  docFrameSel.attr(
    'src',
    `https://embed.documentcloud.org/documents/${occ.document.id}/#document/p${
      occ.page + 1
    }`
  );
  docContainerSel.attr('title', occ.document.title);
  docContainerSel.select('.excerpt').text(`"…${occ.excerpt}…"`);
  docContainerSel.classed('hidden', false);
  docCloseSel.classed('hidden', false);
}

function onTickClick(e, day) {
  d3.selectAll('.date-docs-container').classed('hidden', true);
  d3.select(`#doc-list-${getIdForDate(day)}`).classed('hidden', false);
}

function onYearClick(e, year) {
  currentYear = year;
  yearLabelSel.text(currentYear);
  renderMonthMap(year);

  var occsByMonth = Object.values(occsByDateStringByMonthByYear[year]);
  if (!occsByMonth || occsByMonth.length < 1) {
    return;
  }
}

function onYearMapToggleClick() {
  yearMapContainerSel.classed('hidden', !yearMapContainerSel.classed('hidden'));
  yearMapToggleSel.text(
    yearMapContainerSel.classed('hidden') ? 'Show year map' : 'Hide year map'
  );
}

function onDocCloseClick() {
  docContainerSel.classed('hidden', true);
  docCloseSel.classed('hidden', true);
}

function onUpdateProjectClick() {
  runWithProject(projectInput.node().value);
}

function getIdForDate(dateString) {
  return 'docs-container-' + dateString.slice(0, 10);
}

function distillResult(result) {
  const asset_url = result.asset_url;
  // const asset_url = 'https://s3.documentcloud.org/';
  return {
    id: result.id,
    canonical_url: result.canonical_url,
    slug: result.slug,
    title: result.title,
    pageTextURL: `${asset_url}documents/${result.id}/${result.slug}.txt.json`,
  };
}

async function collectOccFromDocResult({
  id,
  canonical_url,
  slug,
  title,
  pageTextURL,
}) {
  try {
    // The asset URL may redirect to an S3 bucket. The backend at the asset URL
    // will require credentials, but the S3 bucket will reject requests with
    // credentials.
    // However, if we make a request the API with 'accept: application/json'
    // the API will give us a JSON response containing the redirect location
    // instead of redirecting us. We can use that to make separate requests with
    // and without credentials to get the page text we need.
    var directPageTextURL;

    if (pageTextURL.startsWith('https://s3.documentcloud.org')) {
      directPageTextURL = pageTextURL;
    } else {
      let res = await fetchWithOpts({
        pageTextURL,
        opts: { ...defaultFetchOpts, headers: { accept: 'application/json' } },
      });
      if (!res) {
        return;
      }
      let redirectInfo = await res.json();
      directPageTextURL = redirectInfo.location;
    }
    // No credentials here; the request will get rejected if we include them.
    var res = await fetchWithOpts({
      pageTextURL: directPageTextURL,
      opts: { mode: 'cors' },
    });
    if (!res) {
      return;
    }
    var pageInfo = await res.json();
    if (!pageInfo || !pageInfo.pages) {
      console.error('No pages in response from', pageTextURL);
      return;
    }
    let occs = pageInfo.pages.map(getOccurrencesForPage).flat();
    if (occs.length > 0) {
      docsWithDatesCount += 1;
    } else {
      docsWithoutDatesCount += 1;
    }
    occs.forEach(updateStateWithOcc);
    requestAnimationFrame(throttledRenderDocCounts);
  } catch (error) {
    console.error(
      `Error while getting pages for ${slug} at ${pageTextURL}`,
      error
    );
  }

  function getOccurrencesForPage({ page, contents }) {
    var dateResults = findDates(contents);
    return dateResults
      .filter(({ match }) => new Date(match) >= minReasonableDate)
      .map(getOccurrenceForDateResult);

    function getOccurrenceForDateResult({ match, index }) {
      const endPos = index + match.length;
      // Placeholder entity id.
      const entityId = entityCount;
      entityCount += 1;
      try {
        var date = new Date(match);

        return {
          page,
          position: [index, endPos],
          excerpt: contents.slice(index - 10, endPos + 10),
          entity: {
            id: entityId,
            title: date.toLocaleDateString(),
            date: date.toISOString(),
          },
          document: {
            id,
            title,
            url: canonical_url,
          },
        };
      } catch (error) {
        console.error('Error while trying to create date for', match);
      }
    }
  }
}

// Returns the response if it was good, undefined otherwise.
async function fetchWithOpts({ pageTextURL, opts }) {
  let res = await fetch(pageTextURL, opts);
  if (!res.ok) {
    console.error('Error from', pageTextURL, 'Status code:', res.status);
    return;
  }
  return res;
}

// Side effect: Updates counts.
function putInMonthDict(monthDict, dateObj, occ) {
  const year = dateObj.getFullYear();
  const month = dateObj.getMonth();
  if (!counts.byMonthByYear[year]) {
    counts.byMonthByYear[year] = {};
  }
  if (!counts.byMonthByYear[year][month]) {
    counts.byMonthByYear[year][month] = 0;
  }
  counts.byMonthByYear[year][month] += 1;

  var dateStringDict = monthDict[month];
  if (!dateStringDict) {
    dateStringDict = {};
    monthDict[month] = dateStringDict;
  }
  putInDateStringDict(dateStringDict, dateObj, occ);
}

// Side effect: Updates counts.
function putInDateStringDict(dateStringDict, dateObj, occ) {
  const dateString = dateObj.toISOString();

  if (!counts.byDateString[dateString]) {
    counts.byDateString[dateString] = 0;
  }
  counts.byDateString[dateString] += 1;

  var occsList = dateStringDict[dateString];
  if (!occsList) {
    occsList = [];
    dateStringDict[dateString] = occsList;
  }
  occsList.push(occ);
}

function getMostOccsInAMonth(occsByMonth) {
  return Object.values(occsByMonth).reduce(compareOccsInMonthToMax, 0);

  function compareOccsInMonthToMax(maxOccs, occsByDateString) {
    const occsInMonth = countOccsInDateStringDict(occsByDateString);
    if (occsInMonth > maxOccs) {
      return occsInMonth;
    }
    return maxOccs;
  }
}

function countOccsInDateStringDict(occsByDateString) {
  var occArrays = Object.values(occsByDateString);
  return occArrays.reduce((sum, occs) => sum + occs.length, 0);
}

function getDocCountText(year, month) {
  var count;
  var countsForYear = counts.byMonthByYear[year];
  if (countsForYear) {
    count = countsForYear[month];
  }
  if (count) {
    return `${count} dates in documents`;
  }
  return '';
}

async function setUpProjectSelect() {
  try {
    let res = await fetch(selfURL, defaultFetchOpts);
    let userData = await res.json();
    res = await fetch(
      `https://api.www.documentcloud.org/api/projects/?user=${userData.id}&private=unknown&slug=&title=&document=`,
      defaultFetchOpts
    );
    let projectData = await res.json();
    let options = projectSelect.selectAll('option').data(projectData.results);
    options.exit().remove();
    let newOptions = options.enter().append('option');
    newOptions
      .merge(options)
      .attr('value', (project) => project.id)
      .text((project) => project.title)
      .on('click', (project) => runWithProject(project.id));
  } catch (error) {
    handleError(error);
  }
}
