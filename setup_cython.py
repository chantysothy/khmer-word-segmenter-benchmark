"""
Setup script to compile viterbi_fast.pyx with Cython.
Usage: python setup_cython.py build_ext --inplace
"""

from setuptools import setup
from Cython.Build import cythonize
import numpy as np

setup(
    ext_modules=cythonize(
        "khmer_segmenter/viterbi_fast.pyx",
        compiler_directives={
            'language_level': '3',
            'boundscheck': False,
            'wraparound': False,
            'cdivision': True,
        },
        annotate=True,  # Generate HTML annotation file
    ),
    include_dirs=[np.get_include()],
)
