from alembic import context
from sqlalchemy import create_engine, pool

from app import models  # noqa: F401  (register tables)
from app.db import Base

config = context.config
target_metadata = Base.metadata


def run_migrations_online():
    url = config.get_main_option("sqlalchemy.url").replace("%%", "%")
    connectable = create_engine(url, poolclass=pool.NullPool)
    with connectable.connect() as connection:
        context.configure(connection=connection, target_metadata=target_metadata, render_as_batch=url.startswith("sqlite"))
        with context.begin_transaction():
            context.run_migrations()


def run_migrations_offline():
    context.configure(url=config.get_main_option("sqlalchemy.url"), target_metadata=target_metadata, literal_binds=True)
    with context.begin_transaction():
        context.run_migrations()


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
