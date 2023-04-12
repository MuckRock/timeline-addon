test:
	python -m unittest date_entities/integration_tests.py
	# python -m unittest date_entities/add_entities_tests.py
	# python -m unittest date_entities/extraction_tests.py



try:
	python main.py \
	 --username $(DCUSER) --password "$(DCPASS)" \
	 --query +project:211475
