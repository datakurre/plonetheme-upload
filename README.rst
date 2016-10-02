Plone Theme Uploader
====================

Simple tool for packaging (zip) and uploading a Plone theme package
for Plone 5:

..  code::

    usage: plonetheme-upload [-h] [-v] [--enable] source destination

    Plone Theme Uploader

    Positional arguments:
      source         Theme source directory
      destination    Theme destination Plone site

    Optional arguments:
      -h, --help     Show this help message and exit.
      -v, --version  Show program's version number and exit.
      --enable       Enable theme after upload

Uploader always overrides existing theme. If you override existing theme by
accident, you should be able to revert the upload from ZMI undo form.

Uploader supports the default cookie authentication and will save the Plone
session cookie in ``/.plonetheme-upload-cookie``.
