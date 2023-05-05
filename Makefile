run:
	 sudo python3 server.py

diagram:
		cat meta/sequence.dot | dot -Tsvg -v -o meta/sequence.svg