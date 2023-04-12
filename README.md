# timeline-addon

A web app that goes through the logged-in user's documents for dates, then uses them to build a timeline.

## Local dev

To run the webapp locally:

- Add 127.0.0.1 muckrock.github.io to your /etc/hosts
  - This will allow it to make requests to api.www.documentcloud.org without CORS problems.
- [Create .key and .crt files](https://letsencrypt.org/docs/certificates-for-localhost/) for localhost.
- Mash them together: `cat localhost.crt localhost.key > localhost.pem`
- sudo python3 server.py
  - This uses `localhost.pem` for SSL.
- Go to https://muckrock.github.io

## Trying it on the web without running it

Right now, it's at: https://muckrock.github.io/timeline-addon

It's in development, so you should know:

- You need to be logged in on documentcloud.org before using it.
- The left column will contain years found in the documents. Click on bars there to change the frame of the month column next to it and to scroll the dates column next to it so that dates from that year scroll into view.
- You can click a date to see a list of documents containing that date.
- You can click on an item in that list to see that document.
- The documents come in 25 at a time and get searched and graphed as they come in. Right now, there's nothing that tell you it's completely done.
